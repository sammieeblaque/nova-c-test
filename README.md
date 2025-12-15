# Wallet Service API

A robust NestJS-based wallet service with support for wallet creation, funding, and transfers between wallets.

## Features

✅ Create wallets with USD currency  
✅ Fund wallets with validation  
✅ Transfer funds between wallets  
✅ Fetch wallet details with transaction history  
✅ Idempotency support for fund/transfer operations  
✅ Comprehensive validation and error handling  
✅ Database constraints preventing negative balances  
✅ Transaction-safe operations with pessimistic locking  
✅ Unit tests included

## Installation

```bash
npm install
```

## Setup

1. Copy `.env.example` to `.env` and configure your database settings:

```bash
cp .env.example .env
```

2. Make sure PostgreSQL is running

3. Run the application:

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Endpoints

### 1. Create Wallet

**POST** `/wallets`

Request:

```json
{
  "currency": "USD" // Optional, defaults to USD
}
```

Response:

```json
{
  "id": "uuid",
  "currency": "USD",
  "balance": 0,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 2. Fund Wallet

**POST** `/wallets/fund`

Request:

```json
{
  "amount": 100.5,
  "wallet_id": "unique-key-126"
  "idempotencyKey": "unique-key-123", // Optional
  "description": "Initial funding" // Optional
}
```

Response:

```json
{
  "id": "uuid",
  "currency": "USD",
  "balance": 100.5,
  "createdAt": "2024-01-01T00:00:00.000Z",****
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 3. Transfer Between Wallets

**POST** `/wallets/transfer`

Request:

```json
{
  "receiverWalletId": "receiver-uuid",
  "senderWalletId": "sender-uuid",
  "amount": 50.25,
  "idempotencyKey": "unique-transfer-key", // Optional
  "description": "Payment for services" // Optional
}
```

Response:

```json
{
  "sender": {
    "id": "sender-uuid",
    "currency": "USD",
    "balance": 50.25,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "receiver": {
    "id": "receiver-uuid",
    "currency": "USD",
    "balance": 50.25,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 4. Get Wallet Details

**GET** `/wallets/:id`

Response:

```json
{
  "id": "uuid",
  "currency": "USD",
  "balance": 100.5,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "transactions": [
    {
      "id": "tx-uuid",
      "walletId": "uuid",
      "type": "FUND",
      "amount": 100.5,
      "balanceBefore": 0,
      "balanceAfter": 100.5,
      "status": "COMPLETED",
      "description": "Initial funding",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## Error Responses

All errors follow this format:

```json
{
  "statusCode": 400,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/wallets/123/fund",
  "error": "Bad Request",
  "message": "Amount must be positive"
}
```

Common error cases:

- `404 Not Found`: Wallet doesn't exist
- `400 Bad Request`: Invalid input, insufficient balance, same wallet transfer
- `409 Conflict`: Duplicate idempotency key
- `422 Unprocessable Entity`: Validation errors

## Testing

```bash
# Unit tests
npm test

# Test coverage
npm run test:cov

# Watch mode
npm run test:watch
```

## Key Implementation Details

### Idempotency

- Both fund and transfer operations support idempotency keys
- Duplicate requests with the same idempotency key return a 409 Conflict error
- Prevents accidental duplicate transactions

### Negative Balance Prevention

- Database-level CHECK constraint ensures balance >= 0
- Pessimistic locking prevents race conditions
- Transactions rollback on any error

### Transaction Safety

- All financial operations use database transactions
- Pessimistic write locks prevent concurrent updates
- Wallets locked in consistent order to prevent deadlocks
- Automatic rollback on any failure

### Validation

- Class-validator decorators on all DTOs
- Amount must be positive
- UUID validation for wallet IDs
- Maximum 2 decimal places for amounts

## Scaling Considerations for Production

### Database Optimizations

1. **Read Replicas**: Route read operations (GET wallet details) to read replicas while write operations go to the primary database
2. **Connection Pooling**: Configure TypeORM connection pool size based on expected load
3. **Indexing**:
   - Add indexes on `transactions.wallet_id` and `transactions.created_at` for faster transaction history queries
   - Add index on `transactions.idempotency_key` for faster duplicate detection
4. **Partitioning**: Partition transactions table by date for better query performance on large datasets

### Application Scaling

1. **Horizontal Scaling**: Deploy multiple instances behind a load balancer (already stateless)
2. **Caching**:
   - Cache wallet balances in Redis with short TTL
   - Invalidate cache on updates
   - Use for read-heavy scenarios

### Monitoring & Observability

1. **Metrics**: Track transaction success/failure rates, response times, balance integrity
2. **Logging**: Structured logging with correlation IDs for request tracing
3. **Alerting**: Set up alerts for failed transactions, slow queries, balance anomalies
4. **Distributed Tracing**: Use tools like Jaeger or DataDog for request flow visibility

### Security Enhancements

1. **Rate Limiting**: Implement per-user/IP rate limits to prevent abuse
2. **Authentication**: Add JWT/OAuth2 authentication
3. **Authorization**: Implement role-based access control
4. **Audit Trail**: Enhanced audit logging for compliance
5. **Encryption**: Encrypt sensitive data at rest and in transit

### Data Consistency

1. **Event Sourcing**: Consider event sourcing pattern for complete audit trail
2. **CQRS**: Separate read and write models for better scalability
3. **Saga Pattern**: For complex multi-step transactions across services
4. **Reconciliation Jobs**: Periodic jobs to verify balance integrity

### Infrastructure

1. **Database Backups**: Automated backups with point-in-time recovery
2. **Multi-Region**: Deploy across regions for disaster recovery
3. **Auto-scaling**: Configure auto-scaling based on CPU/memory/request metrics
4. **CDN**: Use CDN for static assets if adding a frontend

### Code Quality

1. **E2E Tests**: Add comprehensive end-to-end tests
2. **Load Testing**: Regular load testing to identify bottlenecks
3. **Code Reviews**: Mandatory peer reviews for financial operations
4. **Static Analysis**: Use SonarQube or similar for code quality
