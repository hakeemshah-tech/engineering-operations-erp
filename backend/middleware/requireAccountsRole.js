const ACCOUNTS_ROLES = ['admin', 'manager', 'account_manager'];
const POSTING_ROLES = ['admin', 'manager', 'account_manager'];

function requireAccountsRole(req, res, next) {
  const roles = req.user?.roles || [];
  if (!roles.some(r => ACCOUNTS_ROLES.includes(r))) {
    return res.status(403).json({ message: 'Accounts access required' });
  }
  next();
}

function requirePostingRole(req, res, next) {
  const roles = req.user?.roles || [];
  if (!roles.some(r => POSTING_ROLES.includes(r))) {
    return res.status(403).json({ message: 'Posting permission required' });
  }
  next();
}

module.exports = requireAccountsRole;
module.exports.requireAccountsRole = requireAccountsRole;
module.exports.requirePostingRole = requirePostingRole;
module.exports.ACCOUNTS_ROLES = ACCOUNTS_ROLES;
module.exports.POSTING_ROLES = POSTING_ROLES;
