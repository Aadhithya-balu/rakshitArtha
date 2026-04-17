jest.mock('../services/platformSyncService', () => ({
    syncSingleUserFromPlatform: jest.fn(),
    syncAllUsersForPlatform: jest.fn(),
    upsertWebhookSync: jest.fn(),
    getLatestPlatformActivity: jest.fn(),
    getPlatformSyncSummary: jest.fn().mockResolvedValue({
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        supportedPlatforms: ['SWIGGY', 'ZOMATO', 'UBER'],
        recentRecords: [],
    }),
    assertAllowedPlatform: jest.requireActual('../services/platformSyncService').assertAllowedPlatform,
    buildAuthContext: jest.requireActual('../services/platformSyncService').buildAuthContext,
}));

const request = require('supertest');
const app = require('../app');
const platformSyncService = require('../services/platformSyncService');
const { createMockResponse } = require('../integrations/swiggyService');

describe('Platform integration layer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns the Swiggy mock response shape', () => {
        const response = createMockResponse('swiggy-123');

        expect(response.success).toBe(true);
        expect(response.data.sourcePlatform).toBe('SWIGGY');
        expect(response.data.platformUserId).toBe('swiggy-123');
        expect(typeof response.data.weeklyIncome).toBe('number');
        expect(typeof response.data.weeklyHours).toBe('number');
    });

    test('accepts Uber sync requests', async () => {
        platformSyncService.syncSingleUserFromPlatform.mockResolvedValue({
            user: { _id: 'user-uber-1' },
            record: {
                platformUserId: 'uber-1',
                weeklyIncome: 9200,
                weeklyHours: 44,
                rideOrOrderCount: 66,
                lastActive: new Date('2026-04-16T10:00:00.000Z'),
                syncTimestamp: new Date('2026-04-16T10:00:00.000Z'),
                authType: 'mock',
            },
            changed: true,
        });

        const response = await request(app)
            .post('/api/v1/platform/sync/uber')
            .send({ userId: 'abc123' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(platformSyncService.syncSingleUserFromPlatform).toHaveBeenCalledWith(expect.objectContaining({
            platform: 'UBER',
            userId: 'abc123',
        }));
    });

    test('returns latest platform state for a user', async () => {
        platformSyncService.getLatestPlatformActivity.mockResolvedValue({
            sourcePlatform: 'UBER',
            platformUserId: 'uber-1',
            userId: 'user-1',
            activityStatus: 'ACTIVE',
            activeOrders: 18,
            earnings: 9100,
            weeklyIncome: 9100,
            weeklyHours: 42,
            rideOrOrderCount: 64,
            idleDuration: 24,
            avgOrdersPerHour: 2.14,
            earningsTrend: 0.08,
            activityFactor: 0.82,
            isFullyActive: true,
            syncStatus: 'SUCCESS',
            syncTimestamp: new Date('2026-04-16T10:00:00.000Z').toISOString(),
            lastUpdated: new Date('2026-04-16T10:00:00.000Z').toISOString(),
        });

        const response = await request(app)
            .get('/api/v1/platform/user-1');

        expect(response.status).toBe(200);
        expect(response.body.data.sourcePlatform).toBe('UBER');
        expect(response.body.data.activityStatus).toBe('ACTIVE');
    });

    test('manual sync delegates to the sync service for Swiggy', async () => {
        platformSyncService.syncSingleUserFromPlatform.mockResolvedValue({
            user: { _id: 'user-1' },
            record: {
                platformUserId: 'swiggy-1',
                weeklyIncome: 8100,
                weeklyHours: 41,
                rideOrOrderCount: 58,
                lastActive: new Date('2026-04-16T10:00:00.000Z'),
                syncTimestamp: new Date('2026-04-16T10:00:00.000Z'),
                authType: 'mock',
            },
            changed: true,
        });

        const response = await request(app)
            .post('/api/v1/platform/sync/swiggy')
            .send({ userId: 'user-1', platformUserId: 'swiggy-1' });

        expect(response.status).toBe(200);
        expect(response.body.data.platform).toBe('SWIGGY');
        expect(platformSyncService.syncSingleUserFromPlatform).toHaveBeenCalledWith(expect.objectContaining({
            platform: 'SWIGGY',
            userId: 'user-1',
            platformUserId: 'swiggy-1',
        }));
    });
});