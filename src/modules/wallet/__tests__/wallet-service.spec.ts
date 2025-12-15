import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';
import { WalletService } from '../wallet.service';
import { Wallet } from '../entities/wallet.entity';

describe('WalletService', () => {
  let service: WalletService;
  let walletRepository: any;
  let entityManager: any;

  // UUID v4 IDs
  const MOCK_WALLET_ID = '123e4567-e89b-12d3-a456-426614174000';
  const MOCK_WALLET_ID_2 = '123e4567-e89b-12d3-a456-426614174001';
  const MOCK_WALLET_ID_3 = '123e4567-e89b-12d3-a456-426614174002';
  const MOCK_TRANSACTION_ID = '123e4567-e89b-12d3-a456-426614174003';
  const MOCK_IDEMPOTENCY_KEY_1 = '123e4567-e89b-12d3-a456-426614174004';
  const MOCK_IDEMPOTENCY_KEY_2 = '123e4567-e89b-12d3-a456-426614174005';

  const mockWallet = {
    id: MOCK_WALLET_ID,
    currency: 'USD',
    balance: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSenderWallet = {
    id: MOCK_WALLET_ID,
    currency: 'USD',
    balance: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReceiverWallet = {
    id: MOCK_WALLET_ID_2,
    currency: 'USD',
    balance: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTransaction = {
    id: MOCK_TRANSACTION_ID,
    walletId: MOCK_WALLET_ID,
    type: TransactionType.FUND,
    amount: 50,
    balanceBefore: 100,
    balanceAfter: 150,
    status: TransactionStatus.COMPLETED,
    idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
    description: 'test funding',
  };

  beforeEach(async () => {
    // Create a mock entity manager that simulates the transaction behavior
    const mockEntityManager = {
      transaction: jest.fn((callback) => callback(mockEntityManager)),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: getRepositoryToken(Wallet),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: EntityManager,
          useValue: mockEntityManager,
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    walletRepository = module.get(getRepositoryToken(Wallet));
    entityManager = module.get(EntityManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a wallet with default USD currency', async () => {
      const mockWalletResponse = {
        id: MOCK_WALLET_ID,
        currency: 'USD',
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      walletRepository.create.mockReturnValue(mockWalletResponse);
      walletRepository.save.mockResolvedValue(mockWalletResponse);

      const result = await service.create({ currency: 'USD' });

      expect(walletRepository.create).toHaveBeenCalledWith({
        currency: 'USD',
        balance: 0,
      });
      expect(result).toEqual(mockWalletResponse);
    });
  });

  describe('findOne', () => {
    it('should return a wallet if found', async () => {
      walletRepository.findOne.mockResolvedValue(mockWallet);

      const result = await service.findOne(MOCK_WALLET_ID);

      expect(result).toEqual(mockWallet);
      expect(walletRepository.findOne).toHaveBeenCalledWith({
        where: { id: MOCK_WALLET_ID },
      });
    });

    it('should throw NotFoundException if wallet not found', async () => {
      walletRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(MOCK_WALLET_ID_3)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('fund', () => {
    it('should successfully fund a wallet', async () => {
      const fundAmount = 5000.23;
      const updatedWallet = {
        ...mockWallet,
        balance: mockWallet.balance + fundAmount,
      };

      // Mock the transaction callback
      entityManager.transaction.mockImplementation(async (callback) => {
        return callback(entityManager);
      });

      // No existing transaction with idempotency key
      entityManager.findOne.mockResolvedValueOnce(null);
      // Find wallet with lock - wallet_id from DTO is ignored, using id parameter
      entityManager.findOne.mockResolvedValueOnce(mockWallet);
      // Save wallet
      entityManager.save.mockResolvedValueOnce(updatedWallet);
      // Create transaction
      entityManager.create.mockReturnValueOnce({
        ...mockTransaction,
        amount: fundAmount,
        balanceAfter: updatedWallet.balance,
        idempotencyKey: MOCK_IDEMPOTENCY_KEY_2,
        description: 'testing wallet funding',
      });
      // Save transaction
      entityManager.save.mockResolvedValueOnce(mockTransaction);

      const result = await service.fund(MOCK_WALLET_ID, {
        amount: fundAmount,
        idempotencyKey: MOCK_IDEMPOTENCY_KEY_2,
        description: 'testing wallet funding',
        wallet_id: MOCK_WALLET_ID, // This is in the DTO but not used by service
      });

      expect(entityManager.transaction).toHaveBeenCalled();
      expect(result.balance).toBe(5100.23);
      expect(entityManager.create).toHaveBeenCalledWith(Transaction, {
        walletId: MOCK_WALLET_ID,
        type: TransactionType.FUND,
        amount: fundAmount,
        balanceBefore: 100,
        balanceAfter: 5100.23,
        status: TransactionStatus.COMPLETED,
        idempotencyKey: MOCK_IDEMPOTENCY_KEY_2,
        description: 'testing wallet funding',
      });
    });

    it('should throw ConflictException for duplicate idempotency key', async () => {
      entityManager.transaction.mockImplementation(async (callback) => {
        return callback(entityManager);
      });

      // Existing transaction found
      entityManager.findOne.mockResolvedValueOnce(mockTransaction);

      await expect(
        service.fund(MOCK_WALLET_ID, {
          amount: 5000.23,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1, // Same as existing transaction
          description: 'testing wallet funding',
          wallet_id: MOCK_WALLET_ID,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if wallet not found', async () => {
      entityManager.transaction.mockImplementation(async (callback) => {
        return callback(entityManager);
      });

      // No existing transaction
      entityManager.findOne.mockResolvedValueOnce(null);
      // Wallet not found
      entityManager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.fund(MOCK_WALLET_ID_3, {
          amount: 5000.23,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'funding non-existent wallet',
          wallet_id: MOCK_WALLET_ID_3,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('transfer', () => {
    it('should successfully transfer funds between wallets', async () => {
      const transferAmount = 30;
      const updatedSenderWallet = {
        ...mockSenderWallet,
        balance: mockSenderWallet.balance - transferAmount,
      };
      const updatedReceiverWallet = {
        ...mockReceiverWallet,
        balance: mockReceiverWallet.balance + transferAmount,
      };

      entityManager.transaction.mockImplementation(async (callback) => {
        return callback(entityManager);
      });

      // No existing transaction with idempotency key
      entityManager.findOne.mockResolvedValueOnce(null);
      // Find sender wallet (first in sorted IDs)
      entityManager.findOne.mockResolvedValueOnce(mockSenderWallet);
      // Find receiver wallet (second in sorted IDs)
      entityManager.findOne.mockResolvedValueOnce(mockReceiverWallet);
      // Save sender wallet
      entityManager.save.mockResolvedValueOnce(updatedSenderWallet);
      // Save receiver wallet
      entityManager.save.mockResolvedValueOnce(updatedReceiverWallet);
      // Create sender transaction
      entityManager.create.mockReturnValueOnce({
        ...mockTransaction,
        walletId: MOCK_WALLET_ID,
        type: TransactionType.DEBIT,
        amount: -transferAmount,
        balanceBefore: mockSenderWallet.balance,
        balanceAfter: updatedSenderWallet.balance,
        idempotencyKey: MOCK_IDEMPOTENCY_KEY_2,
        description: `Transfer to ${MOCK_WALLET_ID_2}`,
        relatedWalletId: MOCK_WALLET_ID_2,
      });
      // Create receiver transaction
      entityManager.create.mockReturnValueOnce({
        ...mockTransaction,
        id: '123e4567-e89b-12d3-a456-426614174006',
        walletId: MOCK_WALLET_ID_2,
        type: TransactionType.CREDIT,
        amount: transferAmount,
        balanceBefore: mockReceiverWallet.balance,
        balanceAfter: updatedReceiverWallet.balance,
        description: `Transfer from ${MOCK_WALLET_ID}`,
        relatedWalletId: MOCK_WALLET_ID,
      });
      // Save transactions
      entityManager.save.mockResolvedValueOnce([{}, {}]);

      const result = await service.transfer({
        senderWalletId: MOCK_WALLET_ID,
        receiverWalletId: MOCK_WALLET_ID_2,
        amount: transferAmount,
        idempotencyKey: MOCK_IDEMPOTENCY_KEY_2,
        description: 'wallet transfer',
      });

      expect(result.sender.balance).toBe(70);
      expect(result.receiver.balance).toBe(80);
      expect(entityManager.transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException for same wallet transfer', async () => {
      await expect(
        service.transfer({
          senderWalletId: MOCK_WALLET_ID,
          receiverWalletId: MOCK_WALLET_ID,
          amount: 50,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'self transfer',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for insufficient balance', async () => {
      const insufficientBalanceWallet = {
        ...mockSenderWallet,
        balance: 20,
      };

      entityManager.transaction.mockImplementation(async (callback) => {
        return callback(entityManager);
      });

      // No existing transaction
      entityManager.findOne.mockResolvedValueOnce(null);
      // Find sender wallet
      entityManager.findOne.mockResolvedValueOnce(insufficientBalanceWallet);
      // Find receiver wallet
      entityManager.findOne.mockResolvedValueOnce(mockReceiverWallet);

      await expect(
        service.transfer({
          senderWalletId: MOCK_WALLET_ID,
          receiverWalletId: MOCK_WALLET_ID_2,
          amount: 50, // More than sender's balance
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'insufficient balance transfer',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for different currencies', async () => {
      const differentCurrencyWallet = {
        ...mockReceiverWallet,
        currency: 'EUR',
      };

      entityManager.transaction.mockImplementation(async (callback) => {
        return callback(entityManager);
      });

      // No existing transaction
      entityManager.findOne.mockResolvedValueOnce(null);
      // Find sender wallet
      entityManager.findOne.mockResolvedValueOnce(mockSenderWallet);
      // Find receiver wallet with different currency
      entityManager.findOne.mockResolvedValueOnce(differentCurrencyWallet);

      await expect(
        service.transfer({
          senderWalletId: MOCK_WALLET_ID,
          receiverWalletId: MOCK_WALLET_ID_2,
          amount: 30,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'cross-currency transfer',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if receiver wallet not found', async () => {
      entityManager.transaction.mockImplementation(async (callback) => {
        return callback(entityManager);
      });

      // No existing transaction
      entityManager.findOne.mockResolvedValueOnce(null);
      // Sender wallet found
      entityManager.findOne.mockResolvedValueOnce(mockSenderWallet);
      // Receiver wallet not found
      entityManager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.transfer({
          senderWalletId: MOCK_WALLET_ID,
          receiverWalletId: '123e4567-e89b-12d3-a856-426614174006', // Non-existent
          amount: 30,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'receiver not found',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOneWithTransactions', () => {
    it('should return wallet with transactions', async () => {
      const walletWithTransactions = {
        ...mockWallet,
        transactions: [mockTransaction],
      };

      walletRepository.findOne.mockResolvedValue(walletWithTransactions);

      const result = await service.findOneWithTransactions(MOCK_WALLET_ID);

      expect(result).toEqual(walletWithTransactions);
      expect(walletRepository.findOne).toHaveBeenCalledWith({
        where: { id: MOCK_WALLET_ID },
        relations: ['transactions'],
        order: {
          transactions: {
            createdAt: 'DESC',
          },
        },
      });
    });

    it('should throw NotFoundException if wallet not found', async () => {
      walletRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findOneWithTransactions(MOCK_WALLET_ID_3),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('find', () => {
    it('should return all wallets', async () => {
      const wallets = [mockWallet, mockSenderWallet, mockReceiverWallet];
      walletRepository.find.mockResolvedValue(wallets);

      const result = await service.find();

      expect(result).toEqual(wallets);
      expect(walletRepository.find).toHaveBeenCalled();
    });
  });
});
