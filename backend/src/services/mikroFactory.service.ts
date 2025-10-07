/**
 * Mikro Service Factory
 *
 * Development'ta mock, production'da gerçek Mikro service kullanır
 */

import { config } from '../config';
import mikroMockService from './mikroMock.service';
import mikroService from './mikro.service';

/**
 * Environment'a göre doğru servisi döndür
 */
export const getMikroService = () => {
  if (config.useMockMikro) {
    console.log('🎭 Mock Mikro Service kullanılıyor');
    return mikroMockService;
  } else {
    console.log('🔗 Gerçek Mikro Service kullanılıyor');
    return mikroService;
  }
};

export default getMikroService();
