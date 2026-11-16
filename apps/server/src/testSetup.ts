// Runs before each unit test file (vitest.config.ts). The server's tests sign
// up and in many times; a cheaper password cost keeps them fast on a busy
// machine (QE-15). `auth.test.ts` checks the real cost.

import { TEST_PASSWORD_COST, usePasswordCost } from './users';

usePasswordCost(TEST_PASSWORD_COST);
