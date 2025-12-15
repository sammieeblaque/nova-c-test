import { Entity, Column, OneToMany, Check } from 'typeorm';
import { Transaction } from './transaction.entity';
import { CoreBaseEntity } from '../../../shared/base.entity';

@Entity('wallets')
@Check('"balance" >= 0') // prevents negative balance
export class Wallet extends CoreBaseEntity {
  @Column({
    type: 'enum',
    enum: ['USD'],
    default: 'USD',
  })
  currency: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  balance: number;

  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Transaction[];
}
