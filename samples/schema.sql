-- ProcSim sample schema
-- Run this against your sandbox database first

IF OBJECT_ID('dbo.OrderItems', 'U') IS NOT NULL DROP TABLE dbo.OrderItems;
IF OBJECT_ID('dbo.Orders', 'U') IS NOT NULL DROP TABLE dbo.Orders;
IF OBJECT_ID('dbo.Products', 'U') IS NOT NULL DROP TABLE dbo.Products;

CREATE TABLE dbo.Products (
    ProductId   INT IDENTITY(1,1) PRIMARY KEY,
    Name        NVARCHAR(100) NOT NULL,
    Price       DECIMAL(10,2) NOT NULL,
    Stock       INT NOT NULL DEFAULT 0,
    IsActive    BIT NOT NULL DEFAULT 1
);

CREATE TABLE dbo.Orders (
    OrderId     INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId  INT NOT NULL,
    OrderDate   DATETIME NOT NULL DEFAULT GETDATE(),
    Status      NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    Total       DECIMAL(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE dbo.OrderItems (
    ItemId      INT IDENTITY(1,1) PRIMARY KEY,
    OrderId     INT NOT NULL REFERENCES dbo.Orders(OrderId),
    ProductId   INT NOT NULL REFERENCES dbo.Products(ProductId),
    Quantity    INT NOT NULL,
    UnitPrice   DECIMAL(10,2) NOT NULL
);
