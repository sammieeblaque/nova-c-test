import {
  IsNumber,
  IsPositive,
  IsUUID,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TransferDto {
  @IsUUID('4', { message: 'Receiver wallet ID must be a valid UUID' })
  receiverWalletId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Amount must be positive' })
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
