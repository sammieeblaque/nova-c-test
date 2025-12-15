import { IsEnum, IsOptional } from 'class-validator';

export class CreateWalletDto {
  @IsOptional()
  @IsEnum(['USD'], { message: 'Currently only USD currency is supported' })
  currency?: string = 'USD';
}
