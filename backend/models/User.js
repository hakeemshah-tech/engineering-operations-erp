const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  roles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  passwordChangedAt: {
    type: Date
  },
  passwordResetRequested: {
    type: Boolean,
    default: false
  },
  passwordResetRequestedAt: {
    type: Date
  },
  passwordResetRequestedVia: {
    type: String,
    enum: ['email', 'employee_id', 'phone', null],
    default: null
  }
}, {
  timestamps: true
});

userSchema.index({ passwordResetRequested: 1, passwordResetRequestedAt: -1 });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);