-- ProcSim sample stored procedures
-- Proc 1: Simple SELECT with parameter
-- Proc 2: IF/ELSE with UPDATE (stock check)
-- Proc 3: TRY/CATCH with transaction

-- ============================================================
-- Proc 1: Simple product lookup
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
-- Proc 2: Place an order item with stock check (IF/ELSE)
-- ============================================================
IF OBJECT_ID('dbo.usp_AddOrderItem', 'P') IS NOT NULL DROP PROCEDURE dbo.usp_AddOrderItem;
GO

CREATE PROCEDURE dbo.usp_AddOrderItem
    @OrderId    INT,
    @ProductId  INT,
    @Quantity   INT
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
        -- Sufficient stock: insert item and decrement
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
        -- Insufficient stock
        SELECT 'Insufficient stock' AS Result, @Stock AS AvailableStock, @Quantity AS RequestedQty;
    END
END
GO

-- ============================================================
-- Proc 3: Simple IF/ELSE stock check (SQLite-friendly)
-- ============================================================
IF OBJECT_ID('dbo.usp_CheckStock', 'P') IS NOT NULL DROP PROCEDURE dbo.usp_CheckStock;
GO

CREATE PROCEDURE dbo.usp_CheckStock
    @ProductId INT,
    @RequestedQty INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @CurrentStock INT = 0;
    
    -- Simulate a lookup (SQLite-friendly)
    SELECT @CurrentStock = CASE @ProductId
        WHEN 1 THEN 15
        WHEN 2 THEN 3
        WHEN 3 THEN 0
        ELSE 5
    END;

    IF @CurrentStock IS NULL OR @CurrentStock = 0
    BEGIN
        SELECT 'OUT OF STOCK' AS Status, @ProductId AS ProductId, @CurrentStock AS AvailableStock;
    END
    ELSE IF @CurrentStock >= @RequestedQty
    BEGIN
        SELECT 'IN STOCK - Sufficient' AS Status, @ProductId AS ProductId, @CurrentStock AS AvailableStock, @RequestedQty AS RequestedQty;
    END
    ELSE
    BEGIN
        SELECT 'IN STOCK - Insufficient' AS Status, @ProductId AS ProductId, @CurrentStock AS AvailableStock, @RequestedQty AS RequestedQty;
    END
END
GO

-- ============================================================
-- Proc 4: Batch order processing with TRY/CATCH
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

        -- Update order status
        UPDATE dbo.Orders
        SET Status = 'Processing'
        WHERE OrderId = @OrderId;

        -- Verify all items have sufficient stock
        IF EXISTS (
            SELECT 1
            FROM dbo.OrderItems oi
            JOIN dbo.Products p ON p.ProductId = oi.ProductId
            WHERE oi.OrderId = @OrderId AND p.Stock < oi.Quantity
        )
        BEGIN
            RAISERROR('Insufficient stock for one or more items', 16, 1);
        END

        -- Deduct stock
        UPDATE p
        SET p.Stock = p.Stock - oi.Quantity
        FROM dbo.Products p
        JOIN dbo.OrderItems oi ON oi.ProductId = p.ProductId
        WHERE oi.OrderId = @OrderId;

        -- Mark as shipped
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
            ERROR_NUMBER() AS ErrorNumber,
            ERROR_MESSAGE() AS ErrorMessage,
            'Order processing failed' AS Result;
    END CATCH
END
GO
