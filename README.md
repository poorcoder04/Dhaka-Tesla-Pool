## Key Decisions & Trade-offs

### Money Representation

`Payment.amount` is stored as `Decimal(10,2)` rather than integer
poysha.

**Why:**
- Keeps monetary values readable in the database.
- Directly represents amounts such as `250.50`.
-  simple fare model.

**Alternative considered:**
- Store money as integer poysha (`25050` = ৳250.50).

**Trade-off:**
- Decimal is more readable, but fare calculations must handle
  decimal precision and rounding consistently.

**When I would reconsider:**
- For a larger financial/payment system, I would consider integer
  minor units such as poysha to eliminate decimal arithmetic
  concerns.


  