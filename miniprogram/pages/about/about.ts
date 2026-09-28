import { MASCOT } from '../../utils/mascot';

Page({
  data: {
    mascot: MASCOT.stand,
    mascotCelebrate: MASCOT.celebrate,
    mascotFleeced: MASCOT.fleeced,
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },
});
