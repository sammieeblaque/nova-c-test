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
  let transactionRepository: any;
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
    openingBalance: 100,
    closingBalance: 150,
    status: TransactionStatus.COMPLETED,
    idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
    description: 'test funding',
  };

  beforeEach(async () => {
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
    transactionRepository = module.get(getRepositoryToken(Transaction));
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

      entityManager.transaction.mockImplementation(async (callback) => {
        return callback(entityManager);
      });

      transactionRepository.findOne.mockResolvedValueOnce(null);

      entityManager.findOne.mockResolvedValueOnce(mockWallet);

      entityManager.save.mockResolvedValueOnce(updatedWallet);

      entityManager.create.mockReturnValueOnce({
        ...mockTransaction,
        amount: fundAmount,
        openingBalance: mockWallet.balance,
        closingBalance: updatedWallet.balance,
        idempotencyKey: MOCK_IDEMPOTENCY_KEY_2,
        description: 'testing wallet funding',
      });

      entityManager.save.mockResolvedValueOnce(mockTransaction);

      const result = await service.fund(MOCK_WALLET_ID, {
        amount: fundAmount,
        idempotencyKey: MOCK_IDEMPOTENCY_KEY_2,
        description: 'testing wallet funding',
        wallet_id: MOCK_WALLET_ID,
      });

      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: {
          walletId: MOCK_WALLET_ID,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_2,
        },
      });
      expect(entityManager.transaction).toHaveBeenCalled();
      expect(result.balance).toBe(5100.23);
      expect(entityManager.create).toHaveBeenCalledWith(Transaction, {
        walletId: MOCK_WALLET_ID,
        type: TransactionType.FUND,
        amount: fundAmount,
        openingBalance: 100,
        closingBalance: 5100.23,
        status: TransactionStatus.COMPLETED,
        idempotencyKey: MOCK_IDEMPOTENCY_KEY_2,
        description: 'testing wallet funding',
      });
    });

    it('should throw ConflictException for duplicate idempotency key', async () => {
      transactionRepository.findOne.mockResolvedValueOnce(mockTransaction);

      await expect(
        service.fund(MOCK_WALLET_ID, {
          amount: 5000.23,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'testing wallet funding',
          wallet_id: MOCK_WALLET_ID,
        }),
      ).rejects.toThrow(ConflictException);

      expect(entityManager.transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if wallet not found', async () => {
      entityManager.transaction.mockImplementation(async (callback) => {
        return callback(entityManager);
      });

      transactionRepository.findOne.mockResolvedValueOnce(null);

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

    it('should throw BadRequestException for zero or negative amount', async () => {
      await expect(
        service.fund(MOCK_WALLET_ID, {
          amount: 0,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'zero amount',
          wallet_id: MOCK_WALLET_ID,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.fund(MOCK_WALLET_ID, {
          amount: -50,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'negative amount',
          wallet_id: MOCK_WALLET_ID,
        }),
      ).rejects.toThrow(BadRequestException);
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

      transactionRepository.findOne.mockResolvedValueOnce(null);

      walletRepository.findOne.mockResolvedValueOnce(mockSenderWallet);
      walletRepository.findOne.mockResolvedValueOnce(mockReceiverWallet);

      entityManager.findOne.mockResolvedValueOnce(mockSenderWallet);
      entityManager.findOne.mockResolvedValueOnce(mockReceiverWallet);

      entityManager.save.mockResolvedValueOnce(updatedSenderWallet);

      entityManager.save.mockResolvedValueOnce(updatedReceiverWallet);

      entityManager.create.mockReturnValueOnce({
        walletId: MOCK_WALLET_ID,
        type: TransactionType.DEBIT,
        amount: transferAmount,
        openingBalance: mockSenderWallet.balance,
        closingBalance: updatedSenderWallet.balance,
        status: TransactionStatus.COMPLETED,
        relatedWalletId: MOCK_WALLET_ID_2,
        idempotencyKey: MOCK_IDEMPOTENCY_KEY_2,
        description: `Transfer to ${MOCK_WALLET_ID_2}`,
      });

      entityManager.create.mockReturnValueOnce({
        walletId: MOCK_WALLET_ID_2,
        type: TransactionType.CREDIT,
        amount: transferAmount,
        openingBalance: mockReceiverWallet.balance,
        closingBalance: updatedReceiverWallet.balance,
        status: TransactionStatus.COMPLETED,
        relatedWalletId: MOCK_WALLET_ID,
        description: `Transfer from ${MOCK_WALLET_ID}`,
      });

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

      expect(transactionRepository.findOne).not.toHaveBeenCalled();
      expect(entityManager.transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for zero or negative amount', async () => {
      await expect(
        service.transfer({
          senderWalletId: MOCK_WALLET_ID,
          receiverWalletId: MOCK_WALLET_ID_2,
          amount: 0,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'zero transfer',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.transfer({
          senderWalletId: MOCK_WALLET_ID,
          receiverWalletId: MOCK_WALLET_ID_2,
          amount: -50,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'negative transfer',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException for duplicate idempotency key', async () => {
      transactionRepository.findOne.mockResolvedValueOnce(mockTransaction);

      await expect(
        service.transfer({
          senderWalletId: MOCK_WALLET_ID,
          receiverWalletId: MOCK_WALLET_ID_2,
          amount: 30,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'duplicate transfer',
        }),
      ).rejects.toThrow(ConflictException);

      expect(entityManager.transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for insufficient balance (pre-transaction check)', async () => {
      const insufficientBalanceWallet = {
        ...mockSenderWallet,
        balance: 20,
      };

      transactionRepository.findOne.mockResolvedValueOnce(null);

      walletRepository.findOne.mockResolvedValueOnce(insufficientBalanceWallet);
      walletRepository.findOne.mockResolvedValueOnce(mockReceiverWallet);

      await expect(
        service.transfer({
          senderWalletId: MOCK_WALLET_ID,
          receiverWalletId: MOCK_WALLET_ID_2,
          amount: 50,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'insufficient balance transfer',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(entityManager.transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for different currencies', async () => {
      const differentCurrencyWallet = {
        ...mockReceiverWallet,
        currency: 'EUR',
      };

      transactionRepository.findOne.mockResolvedValueOnce(null);

      walletRepository.findOne.mockResolvedValueOnce(mockSenderWallet);
      walletRepository.findOne.mockResolvedValueOnce(differentCurrencyWallet);

      await expect(
        service.transfer({
          senderWalletId: MOCK_WALLET_ID,
          receiverWalletId: MOCK_WALLET_ID_2,
          amount: 30,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'cross-currency transfer',
        }),
      ).rejects.toThrow(BadRequestException);

      // Should fail in pre-transaction validation
      expect(entityManager.transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if sender wallet not found', async () => {
      // BEFORE transaction: No existing transaction
      transactionRepository.findOne.mockResolvedValueOnce(null);

      // BEFORE transaction: Sender wallet not found
      walletRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.transfer({
          senderWalletId: MOCK_WALLET_ID_3,
          receiverWalletId: MOCK_WALLET_ID_2,
          amount: 30,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'sender not found',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(entityManager.transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if receiver wallet not found', async () => {
      transactionRepository.findOne.mockResolvedValueOnce(null);

      walletRepository.findOne.mockResolvedValueOnce(mockSenderWallet);
      walletRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.transfer({
          senderWalletId: MOCK_WALLET_ID,
          receiverWalletId: '123e4567-e89b-12d3-a856-426614174006',
          amount: 30,
          idempotencyKey: MOCK_IDEMPOTENCY_KEY_1,
          description: 'receiver not found',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(entityManager.transaction).not.toHaveBeenCalled();
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
