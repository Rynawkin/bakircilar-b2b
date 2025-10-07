/**
 * Mikro Service Factory
 *
 * Development'ta mock, production'da gerçek Mikro service kullanır
 */

import { config } from '../config';
import mikroMockService from './mikroMock.service';
import mikroRealService from './mikro.service';

/**
 * Environment'a göre doğru servisi döndür
 */
const getMikroService = (): typeof mikroMockService | typeof mikroRealService => {
  if (config.useMockMikro) {
    console.log('🎭 Mock Mikro Service kullanılıyor');
    return mikroMockService;
  } else {
    console.log('🔗 Gerçek Mikro Service kullanılıyor');
    return mikroRealService;
  }
};

export default getMikroService();
