import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dtos/create-wallet.dto';
import {
  WalletDetailsResponseDto,
  WalletResponseDto,
} from './dtos/wallet-response.dto';
import { FundWalletDto } from './dtos/fund-wallet.dto';
import { TransferDto } from './dtos/transfer.dto';

@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createWalletDto: CreateWalletDto,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletService.create(createWalletDto);
    return {
      id: wallet.id,
      currency: wallet.currency,
      balance: wallet.balance,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getWallets() {
    return this.walletService.find();
  }
  @Post('fund')
  @HttpCode(HttpStatus.OK)
  async fund(@Body() fundWalletDto: FundWalletDto): Promise<WalletResponseDto> {
    const wallet = await this.walletService.fund(
      fundWalletDto.wallet_id,
      fundWalletDto,
    );
    return {
      id: wallet.id,
      currency: wallet.currency,
      balance: wallet.balance,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  async transfer(@Body() transferDto: TransferDto): Promise<{
    sender: WalletResponseDto;
    receiver: WalletResponseDto;
  }> {
    const result = await this.walletService.transfer(
      transferDto.senderWalletId,
      transferDto,
    );
    return {
      sender: {
        id: result.sender.id,
        currency: result.sender.currency,
        balance: result.sender.balance,
        createdAt: result.sender.createdAt,
        updatedAt: result.sender.updatedAt,
      },
      receiver: {
        id: result.receiver.id,
        currency: result.receiver.currency,
        balance: result.receiver.balance,
        createdAt: result.receiver.createdAt,
        updatedAt: result.receiver.updatedAt,
      },
    };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WalletDetailsResponseDto> {
    const wallet = await this.walletService.findOneWithTransactions(id);
    return {
      id: wallet.id,
      currency: wallet.currency,
      balance: wallet.balance,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
      transactions: wallet.transactions,
    };
  }
}
