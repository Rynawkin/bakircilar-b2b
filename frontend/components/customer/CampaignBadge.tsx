'use client';

import { Campaign } from '@/types';
import { formatCurrency } from '@/lib/utils/format';

interface CampaignBadgeProps {
  campaign: Campaign;
  className?: string;
}

export function CampaignBadge({ campaign, className = '' }: CampaignBadgeProps) {
  const getDiscountText = () => {
    if (campaign.type === 'PERCENTAGE') {
      return `%${(campaign.discountValue * 100).toFixed(0)} İndirim`;
    } else if (campaign.type === 'FIXED_AMOUNT') {
      return `${formatCurrency(campaign.discountValue)} İndirim`;
    } else {
      return 'Özel Kampanya';
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded shadow-lg animate-pulse ${className}`}
    >
      <span>🎉</span>
      <span>{getDiscountText()}</span>
    </div>
  );
}

interface CampaignListProps {
  campaigns: Campaign[];
  className?: string;
}

export function CampaignList({ campaigns, className = '' }: CampaignListProps) {
  if (campaigns.length === 0) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <h4 className="text-sm font-semibold text-gray-700">🎯 Aktif Kampanyalar</h4>
      <div className="space-y-1">
        {campaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="flex items-start gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs"
          >
            <span className="text-yellow-600">⭐</span>
            <div className="flex-1">
              <div className="font-semibold text-gray-900">{campaign.name}</div>
              {campaign.description && (
                <div className="text-gray-600 mt-0.5">{campaign.description}</div>
              )}
              {campaign.minOrderAmount && (
                <div className="text-gray-500 mt-1">
                  Min. Sipariş: {formatCurrency(campaign.minOrderAmount)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
