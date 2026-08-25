// One-off: reset the "Testing" customer's feedback via the SAME library
// function the Admin "Reset Feedback" button calls. Scoped to one customer.
import { resetCustomerFeedback } from '../lib/reset.ts'

const customerId = 'cus_QkNNgnBo1QZCJ3S0'
const ok = await resetCustomerFeedback(customerId)
console.log('[v0] resetCustomerFeedback ok =', ok)
process.exit(ok ? 0 : 1)
