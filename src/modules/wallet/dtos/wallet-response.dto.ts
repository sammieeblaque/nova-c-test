import { Transaction } from '@src/modules/wallet/entities/transaction.entity';

export class WalletResponseDto {
  id: string;
  currency: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export class WalletDetailsResponseDto extends WalletResponseDto {
  transactions: Transaction[];
}
