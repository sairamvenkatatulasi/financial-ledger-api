Financial Ledger API

The Financial Ledger API is a backend service built with Node.js, Express, and PostgreSQL that models a real-world financial ledger system.
Instead of storing balances directly, all monetary changes are recorded as immutable ledger entries, and account balances are calculated from these records. This design ensures accuracy, auditability, and data integrity.

What This API Does

Manages user accounts with currency support

Records deposits, withdrawals, and transfers as ledger entries

Calculates balances dynamically from ledger data

Ensures all financial operations are atomic and consistent

Prevents data corruption using database transactions

Technology Overview

Backend Framework: Node.js with Express

Database: PostgreSQL

Architecture Style: RESTful API

Design Pattern: Immutable Ledger (Double-Entry Accounting)

Deployment: Docker-based environment

Project Setup (Conceptual Steps)

The project repository is cloned locally.

Project dependencies are installed.

Environment variables are configured to connect the API service to the PostgreSQL database container.

Docker Compose is used to start both the API server and the database together.

On startup, the database schema is initialized automatically.

Once the services are running, the API becomes accessible through a local port and is ready to receive requests.

Health Verification

A health endpoint is provided to confirm that:

The API server is running

The database connection is active

If the service is healthy, a simple status response is returned.

Database Design Explanation
Accounts Table

Stores basic account metadata such as:

Account ID

Associated user

Account type (e.g., checking)

Currency

Creation timestamp

No balance is stored in this table.

Ledger Entries Table

Acts as the single source of truth for all financial activity:

Each row represents either a DEBIT or CREDIT

Entries are immutable and never updated or deleted

Every financial operation generates one or more ledger entries

Transactions Table

Groups related ledger entries:

Represents the intent (deposit, withdrawal, or transfer)

Tracks transaction type and status

Links source and destination accounts when applicable

How Balance Is Calculated

Account balance is computed dynamically using ledger entries:

All CREDIT amounts are added

All DEBIT amounts are subtracted

This calculation guarantees:

Accurate balances

Full traceability

Protection against manual tampering

API Flow (Step-by-Step)
1. Account Creation

A new account is created by providing:

User identifier

Account type

Currency

The system stores account metadata and returns a unique account ID.

2. Viewing Account Details

Using the account ID:

Account information is retrieved

Balance is calculated in real time from ledger entries

3. Viewing Account Ledger

All ledger entries for an account can be retrieved:

Includes both DEBIT and CREDIT records

Ordered chronologically

Provides a complete transaction history

4. Deposit Flow

When a deposit is requested:

A transaction record of type DEPOSIT is created

A CREDIT ledger entry is added for the account

Both actions occur within a single database transaction

This ensures atomicity and consistency.

5. Withdrawal Flow

When a withdrawal is requested:

The current balance is calculated

If funds are insufficient, the operation is rejected

Otherwise, a WITHDRAWAL transaction is created

A DEBIT ledger entry is added

All steps are executed atomically

6. Transfer Flow

When transferring money between two accounts:

The source account balance is validated

A DEBIT entry is created for the source account

A CREDIT entry is created for the destination account

A TRANSFER transaction groups both entries

Everything executes inside a single database transaction

This guarantees that transfers are all-or-nothing.

Testing the API

The API can be tested using tools such as:

VS Code REST Client

Postman

Any HTTP client

Each endpoint returns structured JSON responses that reflect the operation result and updated ledger state.

Why This Design Is Important

Prevents incorrect balance updates

Enables complete financial audit trails

Mirrors real-world banking systems

Demonstrates strong backend engineering practices