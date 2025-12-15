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
    return this.entityManager.transaction(async (entityManager) => {
      // Check for idempotency
      if (fundWalletDto.idempotencyKey) {
        const existingTransaction = await entityManager.findOne(Transaction, {
          where: {
            walletId: id,
            idempotencyKey: fundWalletDto.idempotencyKey,
          },
        });

        if (existingTransaction) {
          throw new ConflictException(
            'Transaction with this idempotency key already exists',
          );
        }
      }

      // Lock the wallet row for update
      const wallet = await entityManager.findOne(Wallet, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException(`Wallet with ID ${id} not found`);
      }

      const balanceBefore = wallet.balance;
      const newBalance = balanceBefore + fundWalletDto.amount;

      // Update wallet balance
      wallet.balance = newBalance;
      await entityManager.save(Wallet, wallet);

      // Create transaction record
      const transaction = entityManager.create(Transaction, {
        walletId: id,
        type: TransactionType.FUND,
        amount: fundWalletDto.amount,
        balanceBefore,
        balanceAfter: newBalance,
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

    return this.entityManager.transaction(async (entityManager) => {
      if (idempotencyKey) {
        const existingTransaction = await entityManager.findOne(Transaction, {
          where: {
            walletId: senderWalletId,
            idempotencyKey,
          },
        });

        if (existingTransaction) {
          throw new ConflictException(
            'Transaction with this idempotency key already exists',
          );
        }
      }

      const walletIds = [senderWalletId, receiverWalletId].sort();
      const [wallet1, wallet2] = await Promise.all([
        entityManager.findOne(Wallet, {
          where: { id: walletIds[0] },
          lock: { mode: 'pessimistic_write' },
        }),
        entityManager.findOne(Wallet, {
          where: { id: walletIds[1] },
          lock: { mode: 'pessimistic_write' },
        }),
      ]);

      const senderWallet = wallet1?.id === senderWalletId ? wallet1 : wallet2;
      const receiverWallet =
        wallet1?.id === receiverWalletId ? wallet1 : wallet2;

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

      // Update balances
      const senderBalanceBefore = senderWallet.balance;
      const receiverBalanceBefore = receiverWallet.balance;

      senderWallet.balance = senderBalanceBefore - amount;
      receiverWallet.balance = receiverBalanceBefore + amount;

      await entityManager.save(Wallet, senderWallet);
      await entityManager.save(Wallet, receiverWallet);

      // Create transaction records
      const senderTransaction = entityManager.create(Transaction, {
        walletId: senderWalletId,
        type: TransactionType.DEBIT,
        amount: -amount,
        balanceBefore: senderBalanceBefore,
        balanceAfter: senderWallet.balance,
        status: TransactionStatus.COMPLETED,
        relatedWalletId: receiverWalletId,
        idempotencyKey,
        description: description || `Transfer to ${receiverWalletId}`,
      });

      const receiverTransaction = entityManager.create(Transaction, {
        walletId: receiverWalletId,
        type: TransactionType.CREDIT,
        amount,
        balanceBefore: receiverBalanceBefore,
        balanceAfter: receiverWallet.balance,
        status: TransactionStatus.COMPLETED,
        relatedWalletId: senderWalletId,
        description: description || `Transfer from ${senderWalletId}`,
      });

      await entityManager.save(Transaction, [
        senderTransaction,
        receiverTransaction,
      ]);

      return { sender: senderWallet, receiver: receiverWallet };
    });
  }
}
