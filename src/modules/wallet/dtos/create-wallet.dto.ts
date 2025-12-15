import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class CreateWalletDto {
  @ApiProperty({ description: 'currency for wallet creaction' })
  @IsOptional()
  @IsEnum(['USD'], { message: 'Currently only USD currency is supported' })
  currency?: string = 'USD';
}
