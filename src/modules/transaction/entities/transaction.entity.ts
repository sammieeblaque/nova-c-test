// src/transaction/entities/transaction.entity.ts
import { Wallet } from '@src/modules/wallet/entities/wallet.entity';
import { CoreBaseEntity } from '@src/shared/base.entity';
import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';

export enum TransactionType {
  FUND = 'FUND',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('transactions')
@Index(['walletId', 'createdAt'])
export class Transaction extends CoreBaseEntity {
  @Column({ name: 'wallet_id' })
  walletId: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  amount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'balance_before',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  balanceBefore: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'balance_after',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  balanceAfter: number;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ nullable: true, name: 'related_wallet_id' })
  relatedWalletId?: string;

  @Column({ nullable: true, name: 'idempotency_key' })
  @Index()
  idempotencyKey?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;
}
