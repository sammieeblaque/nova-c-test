import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from './entities/transaction.entity';
import { CreateWalletDto } from './dtos/create-wallet.dto';
import { FundWalletDto } from './dtos/fund-wallet.dto';
import { TransferDto } from './dtos/transfer.dto';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async create(createWalletDto: CreateWalletDto): Promise<Wallet> {
    const wallet = this.walletRepository.create({
      currency: createWalletDto.currency || 'USD',
      balance: 0,
    });
    return this.walletRepository.save(wallet);
  }

  async findOne(id: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({ where: { id } });
    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${id} not found`);
    }
    return wallet;
  }

  async find(): Promise<Wallet[]> {
    return await this.walletRepository.find();
  }

  async findOneWithTransactions(id: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id },
      relations: ['transactions'],
      order: {
        transactions: {
          createdAt: 'DESC',
        },
      },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${id} not found`);
    }
    return wallet;
  }

  async fund(id: string, fundWalletDto: FundWalletDto): Promise<Wallet> {
    if (fundWalletDto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    if (fundWalletDto.idempotencyKey) {
      const existingTransaction = await this.transactionRepository.findOne({
        where: {
          walletId: id,
          idempotencyKey: fundWalletDto.idempotencyKey,
        },
      });

      if (existingTransaction) {
        throw new ConflictException('Transaction already successful');
      }
    }

    return this.entityManager.transaction(async (entityManager) => {
      const wallet = await entityManager.findOne(Wallet, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException(`Wallet with ID ${id} not found`);
      }

      const openBalance = wallet.balance;
      const newBalance = openBalance + fundWalletDto.amount;

      // Update wallet balance
      wallet.balance = newBalance;
      await entityManager.save(Wallet, wallet);

      // Create transaction record
      const transaction = entityManager.create(Transaction, {
        walletId: id,
        type: TransactionType.FUND,
        amount: fundWalletDto.amount,
        openingBalance: openBalance,
        closingBalance: newBalance,
        status: TransactionStatus.COMPLETED,
        idempotencyKey: fundWalletDto.idempotencyKey,
        description: fundWalletDto.description || 'Wallet funding',
      });

      await entityManager.save(Transaction, transaction);

      return wallet;
    });
  }

  async transfer(
    transferDto: TransferDto,
  ): Promise<{ sender: Wallet; receiver: Wallet }> {
    const {
      receiverWalletId,
      amount,
      idempotencyKey,
      description,
      senderWalletId,
    } = transferDto;

    if (senderWalletId === receiverWalletId) {
      throw new BadRequestException('Cannot transfer to the same wallet');
    }

    if (amount <= 0) {
      throw new BadRequestException('Transfer amount must be greater than $0');
    }

    // Check idempotency BEFORE transaction
    if (idempotencyKey) {
      const existingTransaction = await this.transactionRepository.findOne({
        where: {
          walletId: senderWalletId,
          idempotencyKey,
        },
      });

      if (existingTransaction) {
        throw new ConflictException('Transaction with id already successfull'); // error message can definitely be better
      }
    }

    const [senderWallet, receiverWallet] = await Promise.all([
      this.walletRepository.findOne({ where: { id: senderWalletId } }),
      this.walletRepository.findOne({ where: { id: receiverWalletId } }),
    ]);

    if (!senderWallet) {
      throw new NotFoundException(
        `Sender wallet with ID ${senderWalletId} not found`,
      );
    }

    if (!receiverWallet) {
      throw new NotFoundException(
        `Receiver wallet with ID ${receiverWalletId} not found`,
      );
    }

    // More validations before transaction
    if (senderWallet.currency !== receiverWallet.currency) {
      throw new BadRequestException(
        'Cannot transfer between wallets with different currencies',
      );
    }

    if (senderWallet.balance < amount) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${senderWallet.balance}, Required: ${amount}`,
      );
    }

    return this.entityManager.transaction(async (entityManager) => {
      // Update balances

      // Acquire locks IN CONSISTENT ORDER to prevent deadlocks - INSIDE transaction
      const walletIds = [senderWalletId, receiverWalletId].sort();
      const [lockedWallet1, lockedWallet2] = await Promise.all([
        entityManager.findOne(Wallet, {
          where: { id: walletIds[0] },
          lock: { mode: 'pessimistic_write' },
        }),
        entityManager.findOne(Wallet, {
          where: { id: walletIds[1] },
          lock: { mode: 'pessimistic_write' },
        }),
      ]);

      // Map locked wallets back to sender/receiver
      const lockedSenderWallet = (
        lockedWallet1?.id === senderWalletId ? lockedWallet1 : lockedWallet2
      ) as Wallet;
      const lockedReceiverWallet = (
        lockedWallet1?.id === receiverWalletId ? lockedWallet1 : lockedWallet2
      ) as Wallet;

      if (lockedSenderWallet.balance < amount) {
        throw new BadRequestException(
          `Insufficient balance. Available: ${lockedSenderWallet.balance}, Required: ${amount}`,
        );
      }
      const senderBalanceBefore = lockedSenderWallet.balance;
      const receiverBalanceBefore = lockedReceiverWallet.balance;

      lockedSenderWallet.balance = senderBalanceBefore - amount;
      lockedReceiverWallet.balance = receiverBalanceBefore + amount;

      await entityManager.save(Wallet, lockedSenderWallet);
      await entityManager.save(Wallet, lockedReceiverWallet);

      const senderTransaction = entityManager.create(Transaction, {
        walletId: senderWalletId,
        type: TransactionType.DEBIT,
        amount: amount,
        openingBalance: senderBalanceBefore,
        closingBalance: lockedSenderWallet.balance,
        status: TransactionStatus.COMPLETED,
        relatedWalletId: receiverWalletId,
        idempotencyKey,
        description: description || `Transfer to ${receiverWalletId}`,
      });

      const receiverTransaction = entityManager.create(Transaction, {
        walletId: receiverWalletId,
        type: TransactionType.CREDIT,
        amount,
        openingBalance: receiverBalanceBefore,
        closingBalance: lockedReceiverWallet.balance,
        status: TransactionStatus.COMPLETED,
        relatedWalletId: senderWalletId,
        description: description || `Transfer from ${senderWalletId}`,
      });

      await entityManager.save(Transaction, [
        senderTransaction,
        receiverTransaction,
      ]);

      return { sender: lockedSenderWallet, receiver: lockedReceiverWallet };
    });
  }
}
