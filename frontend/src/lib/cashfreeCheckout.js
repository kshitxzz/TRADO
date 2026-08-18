// Lazy-loads the official Cashfree Checkout JS SDK (v3) once, then opens the
// hosted checkout modal for a given payment session. Kept framework-agnostic
// so it can be reused anywhere a checkout needs to be triggered.
const CASHFREE_SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js'

let sdkPromise = null

function loadCashfreeScript() {
  if (window.Cashfree) return Promise.resolve()
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CASHFREE_SDK_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Cashfree checkout script'))
    document.body.appendChild(script)
  })
  return sdkPromise
}

// Opens the Cashfree hosted checkout as an in-page modal and resolves once
// the customer finishes (or exits) the payment attempt.
export async function openCashfreeCheckout({ paymentSessionId, mode = 'sandbox' }) {
  await loadCashfreeScript()
  const cashfree = window.Cashfree({ mode })
  return cashfree.checkout({ paymentSessionId, redirectTarget: '_modal' })
}