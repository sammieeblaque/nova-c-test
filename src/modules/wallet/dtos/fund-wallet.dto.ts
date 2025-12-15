import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class FundWalletDto {
  @ApiProperty({ description: 'Amount', example: '220.45' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Amount must be positive' })
  @Type(() => Number)
  amount: number;

  @IsUUID('4', { message: 'wallet ID must be a valid UUID' })
  wallet_id: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiProperty({
    description: 'Description of funding',
    example: 'wallet funding',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
