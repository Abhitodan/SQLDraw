-- ProcSim Full Setup Script
-- Creates ProcSimTest database, schema, seed data, and stored procedures

USE master;
GO

-- Create database if it doesn't exist
IF DB_ID('ProcSimTest') IS NULL
BEGIN
    CREATE DATABASE ProcSimTest;
    PRINT 'Database ProcSimTest created.';
END
ELSE
    PRINT 'Database ProcSimTest already exists.';
GO

USE ProcSimTest;
GO

-- ============================================================
-- Schema
-- ============================================================

IF OBJECT_ID('dbo.OrderItems', 'U') IS NOT NULL DROP TABLE dbo.OrderItems;
IF OBJECT_ID('dbo.Orders',     'U') IS NOT NULL DROP TABLE dbo.Orders;
IF OBJECT_ID('dbo.Products',   'U') IS NOT NULL DROP TABLE dbo.Products;
GO

CREATE TABLE dbo.Products (
    ProductId   INT IDENTITY(1,1) PRIMARY KEY,
    Name        NVARCHAR(100)  NOT NULL,
    Price       DECIMAL(10,2)  NOT NULL,
    Stock       INT            NOT NULL DEFAULT 0,
    IsActive    BIT            NOT NULL DEFAULT 1
);

CREATE TABLE dbo.Orders (
    OrderId     INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId  INT            NOT NULL,
    OrderDate   DATETIME       NOT NULL DEFAULT GETDATE(),
    Status      NVARCHAR(20)   NOT NULL DEFAULT 'Pending',
    Total       DECIMAL(10,2)  NOT NULL DEFAULT 0
);

CREATE TABLE dbo.OrderItems (
    ItemId      INT IDENTITY(1,1) PRIMARY KEY,
    OrderId     INT NOT NULL REFERENCES dbo.Orders(OrderId),
    ProductId   INT NOT NULL REFERENCES dbo.Products(ProductId),
    Quantity    INT            NOT NULL,
    UnitPrice   DECIMAL(10,2)  NOT NULL
);
GO

PRINT 'Tables created: Products, Orders, OrderItems';

-- ============================================================
-- Seed Data
-- ============================================================

SET IDENTITY_INSERT dbo.Products OFF;

INSERT INTO dbo.Products (Name, Price, Stock, IsActive) VALUES
    ('Widget A',  9.99,  100, 1),
    ('Widget B',  19.99,  50, 1),
    ('Widget C',  29.99,   0, 1),
    ('Gadget X',  49.99, 200, 1),
    ('Gadget Y',  99.99,  10, 1),
    ('Archive Z', 4.99,    5, 0);

INSERT INTO dbo.Orders (CustomerId, Status, Total) VALUES
    (1, 'Pending',    0.00),
    (2, 'Shipped',   59.97),
    (3, 'Processing', 0.00);

INSERT INTO dbo.OrderItems (OrderId, ProductId, Quantity, UnitPrice) VALUES
    (2, 1, 3,  9.99),
    (2, 2, 1, 19.99);

PRINT 'Seed data inserted.';
GO

-- ============================================================
-- Stored Procedure 1: usp_GetProducts
-- Simple SELECT with optional active filter
-- ============================================================

IF OBJECT_ID('dbo.usp_GetProducts', 'P') IS NOT NULL DROP PROCEDURE dbo.usp_GetProducts;
GO

CREATE PROCEDURE dbo.usp_GetProducts
    @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    SELECT ProductId, Name, Price, Stock
    FROM dbo.Products
    WHERE IsActive = @IsActive
    ORDER BY Name;

    SELECT COUNT(*) AS TotalProducts
    FROM dbo.Products
    WHERE IsActive = @IsActive;
END
GO

-- ============================================================
-- Stored Procedure 2: usp_AddOrderItem
-- IF/ELSE with stock check, INSERT + UPDATE
-- ============================================================

IF OBJECT_ID('dbo.usp_AddOrderItem', 'P') IS NOT NULL DROP PROCEDURE dbo.usp_AddOrderItem;
GO

CREATE PROCEDURE dbo.usp_AddOrderItem
    @OrderId   INT,
    @ProductId INT,
    @Quantity  INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Stock INT, @Price DECIMAL(10,2);

    SELECT @Stock = Stock, @Price = Price
    FROM dbo.Products
    WHERE ProductId = @ProductId;

    IF @Stock IS NULL
    BEGIN
        RAISERROR('Product not found', 16, 1);
        RETURN;
    END

    IF @Stock >= @Quantity
    BEGIN
        INSERT INTO dbo.OrderItems (OrderId, ProductId, Quantity, UnitPrice)
        VALUES (@OrderId, @ProductId, @Quantity, @Price);

        UPDATE dbo.Products
        SET Stock = Stock - @Quantity
        WHERE ProductId = @ProductId;

        UPDATE dbo.Orders
        SET Total = Total + (@Price * @Quantity)
        WHERE OrderId = @OrderId;

        SELECT 'Item added successfully' AS Result, @Quantity AS Qty, @Price AS UnitPrice;
    END
    ELSE
    BEGIN
        SELECT 'Insufficient stock' AS Result, @Stock AS AvailableStock, @Quantity AS RequestedQty;
    END
END
GO

-- ============================================================
-- Stored Procedure 3: usp_CheckStock
-- IF/ELSE chain — SQLite-sandbox friendly (no table dep)
-- ============================================================

IF OBJECT_ID('dbo.usp_CheckStock', 'P') IS NOT NULL DROP PROCEDURE dbo.usp_CheckStock;
GO

CREATE PROCEDURE dbo.usp_CheckStock
    @ProductId    INT,
    @RequestedQty INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @CurrentStock INT;

    SELECT @CurrentStock = Stock
    FROM dbo.Products
    WHERE ProductId = @ProductId;

    IF @CurrentStock IS NULL OR @CurrentStock = 0
    BEGIN
        SELECT 'OUT OF STOCK' AS Status, @ProductId AS ProductId, @CurrentStock AS AvailableStock;
    END
    ELSE IF @CurrentStock >= @RequestedQty
    BEGIN
        SELECT 'IN STOCK - Sufficient'   AS Status, @ProductId AS ProductId,
               @CurrentStock AS AvailableStock, @RequestedQty AS RequestedQty;
    END
    ELSE
    BEGIN
        SELECT 'IN STOCK - Insufficient' AS Status, @ProductId AS ProductId,
               @CurrentStock AS AvailableStock, @RequestedQty AS RequestedQty;
    END
END
GO

-- ============================================================
-- Stored Procedure 4: usp_ProcessOrder
-- TRY/CATCH + transaction + nested IF + stock deduction
-- ============================================================

IF OBJECT_ID('dbo.usp_ProcessOrder', 'P') IS NOT NULL DROP PROCEDURE dbo.usp_ProcessOrder;
GO

CREATE PROCEDURE dbo.usp_ProcessOrder
    @OrderId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @CurrentStatus NVARCHAR(20);

    SELECT @CurrentStatus = Status
    FROM dbo.Orders
    WHERE OrderId = @OrderId;

    IF @CurrentStatus IS NULL
    BEGIN
        RAISERROR('Order not found', 16, 1);
        RETURN;
    END

    IF @CurrentStatus <> 'Pending'
    BEGIN
        SELECT 'Order is not in Pending status' AS Result, @CurrentStatus AS CurrentStatus;
        RETURN;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Orders
        SET Status = 'Processing'
        WHERE OrderId = @OrderId;

        IF EXISTS (
            SELECT 1
            FROM dbo.OrderItems oi
            JOIN dbo.Products   p  ON p.ProductId = oi.ProductId
            WHERE oi.OrderId = @OrderId AND p.Stock < oi.Quantity
        )
        BEGIN
            RAISERROR('Insufficient stock for one or more items', 16, 1);
        END

        UPDATE p
        SET p.Stock = p.Stock - oi.Quantity
        FROM dbo.Products    p
        JOIN dbo.OrderItems  oi ON oi.ProductId = p.ProductId
        WHERE oi.OrderId = @OrderId;

        UPDATE dbo.Orders
        SET Status = 'Shipped'
        WHERE OrderId = @OrderId;

        COMMIT TRANSACTION;

        SELECT 'Order processed successfully' AS Result, @OrderId AS OrderId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        SELECT
            ERROR_NUMBER()  AS ErrorNumber,
            ERROR_MESSAGE() AS ErrorMessage,
            'Order processing failed' AS Result;
    END CATCH
END
GO

-- ============================================================
-- Stored Procedure 5: usp_GetOrderSummary
-- WHILE loop + running total accumulator
-- ============================================================

IF OBJECT_ID('dbo.usp_GetOrderSummary', 'P') IS NOT NULL DROP PROCEDURE dbo.usp_GetOrderSummary;
GO

CREATE PROCEDURE dbo.usp_GetOrderSummary
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @OrderId   INT, @Total DECIMAL(10,2), @RunningTotal DECIMAL(10,2) = 0;
    DECLARE @ItemCount INT = 0;

    DECLARE cur CURSOR FOR
        SELECT OrderId, Total FROM dbo.Orders WHERE CustomerId = @CustomerId;

    OPEN cur;
    FETCH NEXT FROM cur INTO @OrderId, @Total;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @RunningTotal = @RunningTotal + @Total;
        SET @ItemCount    = @ItemCount + 1;
        FETCH NEXT FROM cur INTO @OrderId, @Total;
    END

    CLOSE cur;
    DEALLOCATE cur;

    SELECT
        @CustomerId   AS CustomerId,
        @ItemCount    AS OrderCount,
        @RunningTotal AS LifetimeValue;
END
GO

PRINT 'Stored procedures created: usp_GetProducts, usp_AddOrderItem, usp_CheckStock, usp_ProcessOrder, usp_GetOrderSummary';

-- ============================================================
-- Quick smoke-test
-- ============================================================

PRINT '--- Smoke tests ---';

EXEC dbo.usp_GetProducts @IsActive = 1;
EXEC dbo.usp_CheckStock  @ProductId = 1, @RequestedQty = 5;
EXEC dbo.usp_CheckStock  @ProductId = 3, @RequestedQty = 1;   -- out of stock
EXEC dbo.usp_GetOrderSummary @CustomerId = 2;

PRINT '--- Setup complete ---';
GO
