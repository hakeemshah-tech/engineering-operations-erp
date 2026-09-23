const mongoose = require('mongoose');

const voucherSyncTrackSchema = new mongoose.Schema({
  journalEntry: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry',
    required: true,
    index: true
  },
  attemptNo: {
    type: Number,
    required: true,
    min: 1
  },
  action: {
    type: String,
    required: true,
    enum: ['XML_GENERATED', 'DOWNLOADED', 'ACK_SYNCED', 'FAILED']
  },
  xmlPayload: { type: String },
  xmlChecksum: { type: String, index: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agentId: { type: String, trim: true },
  error: { type: String }
}, {
  timestamps: true
});

voucherSyncTrackSchema.index({ journalEntry: 1, attemptNo: 1 });
voucherSyncTrackSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('VoucherSyncTrack', voucherSyncTrackSchema);
