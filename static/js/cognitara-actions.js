/**
 * CogniTaraActions - Unified No-Reload Action, AJAX Dispatcher & Button Loader
 * CogniTara Exam Portal Phase 4.6
 *
 * Guarantees:
 * - Zero full-page reloads on mutating actions (Delete, Stop, Start, Reset, Approve, Reject)
 * - Accessible button loading states (aria-busy="true", micro-spinner, no layout shift)
 * - Double-click and rapid-click protection
 * - Automatic CSRF extraction and injection
 * - Optimistic DOM updates with automatic rollback on network failure
 */
(function(window, document) {
    'use strict';

    const CogniTaraActions = {
        /**
         * Extract current CSRF token from DOM or meta tag
         */
        getCsrfToken() {
            return window.CSRF_TOKEN ||
                document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
                document.querySelector('input[name="csrf_token"]')?.value ||
                '';
        },

        /**
         * Show toast notification using SweetAlert2 if present, or lightweight fallback toast
         */
        toast(message, type = 'success') {
            if (window.Swal) {
                window.Swal.fire({
                    title: type === 'success' ? 'Success' : (type === 'error' || type === 'danger') ? 'Error' : 'Notice',
                    text: message,
                    icon: type === 'danger' ? 'error' : type,
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3500,
                    timerProgressBar: true
                });
            } else {
                let rack = document.getElementById('cognitara-toast-rack');
                if (!rack) {
                    rack = document.createElement('div');
                    rack.id = 'cognitara-toast-rack';
                    rack.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
                    document.body.appendChild(rack);
                }
                const toast = document.createElement('div');
                toast.style.cssText = `padding:12px 20px;border-radius:10px;color:white;font-weight:600;font-size:14px;box-shadow:0 8px 20px rgba(0,0,0,0.15);pointer-events:auto;transition:all 0.3s;background:${type === 'success' ? '#10b981' : (type === 'error' || type === 'danger') ? '#ef4444' : '#3b82f6'};`;
                toast.textContent = message;
                rack.appendChild(toast);
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateX(100%)';
                    setTimeout(() => toast.remove(), 300);
                }, 3500);
            }
        },

        /**
         * Standard confirmation dialog supporting SweetAlert2 and native fallback
         */
        async confirm(options) {
            const {
                title = 'Are you sure?',
                message = 'This action cannot be undone.',
                confirmText = 'Yes, Proceed',
                cancelText = 'Cancel',
                confirmColor = '#1a56db',
                icon = 'question'
            } = options;

            if (window.Swal) {
                const res = await window.Swal.fire({
                    title,
                    html: message,
                    icon,
                    showCancelButton: true,
                    confirmButtonText: confirmText,
                    cancelButtonText: cancelText,
                    confirmButtonColor: confirmColor,
                    reverseButtons: true,
                    focusCancel: true
                });
                return res.isConfirmed;
            }
            return window.confirm(`${title}\n\n${message.replace(/<[^>]*>/g, '')}`);
        },

        /**
         * Sets an accessible, stable loading state on any button without layout shift
         */
        setButtonLoading(btn, loadingText = 'Processing...') {
            if (!btn || btn.dataset.inFlight === 'true') return false;
            btn.dataset.inFlight = 'true';
            btn.dataset.origHtml = btn.innerHTML;
            btn.dataset.origWidth = btn.offsetWidth ? `${btn.offsetWidth}px` : '';
            if (btn.dataset.origWidth) {
                btn.style.minWidth = btn.dataset.origWidth; // Prevent layout shift
            }
            btn.disabled = true;
            btn.setAttribute('aria-busy', 'true');
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" style="width:0.85rem;height:0.85rem;border-width:2px;display:inline-block;vertical-align:middle;"></span> ${loadingText}`;
            return true;
        },

        /**
         * Restores button to original state
         */
        restoreButton(btn) {
            if (!btn) return;
            if (btn.dataset.origHtml) {
                btn.innerHTML = btn.dataset.origHtml;
            }
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
            delete btn.dataset.inFlight;
            delete btn.dataset.origHtml;
        },

        /**
         * Main action runner with button loading states, rollback on failure, and double-click lock
         */
        async execute(config) {
            const {
                url,
                method = 'POST',
                data = null,
                triggerEl = null,
                loadingText = 'Processing...',
                confirm: confirmConfig = null,
                optimisticDomUpdate = null,
                rollbackDomUpdate = null,
                onSuccess = null,
                onError = null
            } = config;

            // Optional confirmation step
            if (confirmConfig) {
                const confirmed = await this.confirm(confirmConfig);
                if (!confirmed) return false;
            }

            // Button loading state & lock
            if (triggerEl) {
                const locked = this.setButtonLoading(triggerEl, loadingText);
                if (!locked) return false; // Already in-flight
            }

            // Apply optimistic DOM changes if provided
            let optimisticState = null;
            if (typeof optimisticDomUpdate === 'function') {
                try {
                    optimisticState = optimisticDomUpdate();
                } catch (e) {
                    console.error('Optimistic DOM update failed:', e);
                }
            }

            try {
                const headers = {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                };

                const token = this.getCsrfToken();
                if (token) {
                    headers['X-CSRFToken'] = token;
                }

                let body = null;
                if (data instanceof FormData) {
                    body = data;
                } else if (data && typeof data === 'object') {
                    headers['Content-Type'] = 'application/json';
                    body = JSON.stringify(data);
                }

                const response = await fetch(url, {
                    method: method.toUpperCase(),
                    headers,
                    body
                });

                const resData = await response.json().catch(() => ({}));

                if (response.ok && (resData.ok !== false && resData.success !== false)) {
                    this.toast(resData.message || 'Action completed successfully', 'success');
                    if (typeof onSuccess === 'function') {
                        onSuccess(resData);
                    }
                    return true;
                } else {
                    throw new Error(resData.error || resData.message || `Request failed (${response.status})`);
                }
            } catch (err) {
                // Rollback optimistic DOM updates on failure
                if (typeof rollbackDomUpdate === 'function') {
                    rollbackDomUpdate(optimisticState);
                }
                this.toast(err.message || 'A network error occurred. Reverting changes.', 'error');
                if (typeof onError === 'function') {
                    onError(err);
                }
                return false;
            } finally {
                // Restore button state
                if (triggerEl) {
                    this.restoreButton(triggerEl);
                }
            }
        },

        /**
         * Declarative DOM binder: auto-binds elements with data-cognitara-action
         */
        bindDeclarativeActions() {
            document.querySelectorAll('[data-cognitara-action]:not([data-bound])').forEach(el => {
                el.dataset.bound = 'true';
                el.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const url = el.getAttribute('data-cognitara-action');
                    const method = el.getAttribute('data-method') || 'POST';
                    const confirmTitle = el.getAttribute('data-confirm-title');
                    const confirmMsg = el.getAttribute('data-confirm-msg');
                    const confirmColor = el.getAttribute('data-confirm-color') || '#dc2626';

                    let confirmConfig = null;
                    if (confirmTitle || confirmMsg) {
                        confirmConfig = {
                            title: confirmTitle || 'Confirm Action',
                            message: confirmMsg || 'Are you sure?',
                            confirmColor
                        };
                    }

                    await this.execute({
                        url,
                        method,
                        triggerEl: el,
                        confirm: confirmConfig,
                        onSuccess: (resData) => {
                            const removeTarget = el.getAttribute('data-remove-target');
                            if (removeTarget) {
                                const targetEl = document.querySelector(removeTarget);
                                if (targetEl) {
                                    targetEl.style.transition = 'all 0.3s ease';
                                    targetEl.style.opacity = '0';
                                    targetEl.style.transform = 'scale(0.95)';
                                    setTimeout(() => targetEl.remove(), 300);
                                }
                            }
                        }
                    });
                });
            });
        }
    };

    // Auto-init on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => CogniTaraActions.bindDeclarativeActions());
    } else {
        CogniTaraActions.bindDeclarativeActions();
    }

    window.CogniTaraActions = CogniTaraActions;
})(window, document);
