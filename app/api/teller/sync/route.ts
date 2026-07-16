// Legacy path alias for the iOS app (still calls /api/teller/*).
// Remove once iOS switches to /api/bank/*.
export { GET, POST } from '@/app/api/bank/sync/route';
