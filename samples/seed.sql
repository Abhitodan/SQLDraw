-- ProcSim sample seed data

INSERT INTO dbo.Products (Name, Price, Stock) VALUES
    ('Widget A', 9.99, 100),
    ('Widget B', 19.99, 50),
    ('Widget C', 29.99, 0),
    ('Gadget X', 49.99, 200);

INSERT INTO dbo.Orders (CustomerId, Status, Total) VALUES
    (1, 'Pending', 0),
    (2, 'Shipped', 59.97);

INSERT INTO dbo.OrderItems (OrderId, ProductId, Quantity, UnitPrice) VALUES
    (2, 1, 3, 9.99),
    (2, 2, 1, 19.99);
