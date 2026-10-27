/**
 * MFA Step-up Authentication Utilities
 * Handles MFA verification for high-level activities
 */

export interface MFAResponse {
  success: boolean;
  verified: boolean;
  error?: string;
}

/**
 * Check if MFA verification is still valid (within 15 minutes)
 */
export function isMFAVerified(): boolean {
  if (typeof document === 'undefined') return false;

  // Always false now, and that is correct rather than broken.
  //
  // mfa_verified is httpOnly, so document.cookie cannot see it - the browser
  // will not hand a script the proof that a second factor was completed. The
  // previous implementation returned whatever the cookie said, which is exactly
  // the weakness: a client-asserted value cannot be evidence.
  //
  // The server must decide. Both API routes that gate on step-up call their own
  // verifyMFAStepUp, which reads the cookie server-side where it is genuine.
  return false;

  // Retained below for reference only; unreachable.
  /* eslint-disable no-unreachable */
  const mfaVerified = document.cookie
    .split('; ')
    .find(row => row.startsWith('mfa_verified='))
    ?.split('=')[1];

  if (!mfaVerified) return false;

  const timestamp = parseInt(mfaVerified);
  const now = Date.now();
  const ageInMinutes = (now - timestamp) / 1000 / 60;

  return ageInMinutes < 15;
}

/**
 * Perform MFA step-up authentication
 */
export async function performMFAStepUp(): Promise<MFAResponse> {
  return new Promise((resolve) => {
    // Check if already verified
    if (isMFAVerified()) {
      resolve({ success: true, verified: true });
      return;
    }

    // Create MFA modal
    const modal = createMFAModal(resolve);
    document.body.appendChild(modal);
  });
}

/**
 * Create MFA verification modal
 */
function createMFAModal(callback: (response: MFAResponse) => void): HTMLElement {
  const modalHTML = `
    <div id="mfa-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-[#16181D] rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div class="text-center mb-6">
          <div class="w-12 h-12 bg-[#EAF7EE] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-6 h-6 text-[#0D5C3A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Security Verification Required</h3>
          <p class="text-sm text-gray-600 dark:text-gray-300 mt-2">This action requires additional verification. Please enter your authentication code.</p>
        </div>

        <div class="space-y-4">
          <div class="flex justify-center space-x-2 mb-4">
            <button id="use-totp" class="px-3 py-1 bg-[#0D5C3A] text-white rounded text-sm">Authenticator</button>
            <button id="use-backup" class="px-3 py-1 bg-gray-300 text-gray-700 dark:text-gray-200 rounded text-sm">Backup Code</button>
          </div>

          <div id="totp-input" class="space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Authentication Code</label>
            <input 
              id="totp-code" 
              type="text" 
              placeholder="Enter 6-digit code" 
              maxlength="6" 
              class="w-full px-3 py-2 border border-gray-300 rounded-md text-center text-lg tracking-widest"
            />
          </div>

          <div id="backup-input" class="space-y-2 hidden">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Backup Code</label>
            <input 
              id="backup-code" 
              type="text" 
              placeholder="Enter backup code" 
              maxlength="8" 
              class="w-full px-3 py-2 border border-gray-300 rounded-md text-center text-lg tracking-wide"
            />
          </div>

          <div id="error-message" class="hidden bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm"></div>

          <div class="flex space-x-3">
            <button id="verify-btn" class="flex-1 bg-[#0D5C3A] text-white py-2 px-4 rounded-md hover:bg-gray-200 dark:hover:bg-[#2D3139]">
              Verify
            </button>
            <button id="cancel-btn" class="flex-1 bg-gray-300 text-gray-700 dark:text-gray-200 py-2 px-4 rounded-md hover:bg-gray-400">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = modalHTML;
  const modal = modalContainer.firstElementChild as HTMLElement;

  let useBackupCode = false;

  // Event handlers
  const totpBtn = modal.querySelector('#use-totp') as HTMLElement;
  const backupBtn = modal.querySelector('#use-backup') as HTMLElement;
  const totpInput = modal.querySelector('#totp-input') as HTMLElement;
  const backupInput = modal.querySelector('#backup-input') as HTMLElement;
  const verifyBtn = modal.querySelector('#verify-btn') as HTMLElement;
  const cancelBtn = modal.querySelector('#cancel-btn') as HTMLElement;
  const errorDiv = modal.querySelector('#error-message') as HTMLElement;

  // Toggle input type
  totpBtn.onclick = () => {
    useBackupCode = false;
    totpBtn.className = 'px-3 py-1 bg-[#0D5C3A] text-white rounded text-sm';
    backupBtn.className = 'px-3 py-1 bg-gray-300 text-gray-700 dark:text-gray-200 rounded text-sm';
    totpInput.classList.remove('hidden');
    backupInput.classList.add('hidden');
  };

  backupBtn.onclick = () => {
    useBackupCode = true;
    backupBtn.className = 'px-3 py-1 bg-[#0D5C3A] text-white rounded text-sm';
    totpBtn.className = 'px-3 py-1 bg-gray-300 text-gray-700 dark:text-gray-200 rounded text-sm';
    backupInput.classList.remove('hidden');
    totpInput.classList.add('hidden');
  };

  // Verify button
  verifyBtn.onclick = async () => {
    const code = useBackupCode 
      ? (modal.querySelector('#backup-code') as HTMLInputElement).value.trim()
      : (modal.querySelector('#totp-code') as HTMLInputElement).value.trim();

    if (!code) {
      showError('Please enter a verification code');
      return;
    }

    verifyBtn.textContent = 'Verifying...';
    verifyBtn.setAttribute('disabled', 'true');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'verifyMFA',
          token: code,
          isBackupCode: useBackupCode
        })
      });

      if (response.ok) {
        // The server sets mfa_verified, httpOnly, in the response.
        //
        // The client used to set it here, which made the second-factor verdict
        // something any script could assert with one line. It is now issued by
        // the endpoint that actually verified the code, and cannot be forged.
        //
        // isMFAVerified() below still reads the cookie: httpOnly hides it from
        // document.cookie, so the client-side check is now a best-effort hint
        // rather than the source of truth. The server-side verifyMFAStepUp
        // helpers are what must gate a sensitive action.
        modal.remove();
        callback({ success: true, verified: true });
      } else {
        const data = await response.json();
        showError(data.error || 'Verification failed');
      }
    } catch (err) {
      showError('An error occurred. Please try again.');
    } finally {
      verifyBtn.textContent = 'Verify';
      verifyBtn.removeAttribute('disabled');
    }
  };

  // Cancel button
  cancelBtn.onclick = () => {
    modal.remove();
    callback({ success: false, verified: false, error: 'Verification cancelled' });
  };

  function showError(message: string) {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
  }

  // Enter key support
  modal.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      verifyBtn.click();
    }
  });

  return modal;
}

/**
 * Wrapper function for API calls that require MFA step-up
 */
export async function performSecureAction(
  actionFn: () => Promise<Response>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // First, try the action
    const response = await actionFn();
    
    if (response.status === 403) {
      const data = await response.json();
      if (data.requiresMFA) {
        // Perform MFA step-up
        const mfaResult = await performMFAStepUp();
        
        if (mfaResult.verified) {
          // Retry the action
          const retryResponse = await actionFn();
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            return { success: true, data: retryData };
          } else {
            const errorData = await retryResponse.json();
            return { success: false, error: errorData.error || 'Action failed' };
          }
        } else {
          return { success: false, error: 'MFA verification required' };
        }
      }
    }

    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    } else {
      const data = await response.json();
      return { success: false, error: data.error || 'Action failed' };
    }
  } catch (error) {
    return { success: false, error: 'Network error occurred' };
  }
}
