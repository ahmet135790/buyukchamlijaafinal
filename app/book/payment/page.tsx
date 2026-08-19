"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BankTransferDisplay } from "@/components/booking/bank-transfer-display";
import { CashAtGateDisplay } from "@/components/booking/cash-at-gate-display";
import { PaymentMethodSelector } from "@/components/booking/payment-method-selector";
import { getBookingPaymentState, type BookingPaymentSummary, type PaymentMethod } from "@/lib/payments/manual";

function PaymentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = searchParams.get("bookingId") ?? "";
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    booking: BookingPaymentSummary | null;
    selectedMethod: PaymentMethod | null;
    reservationConfirmed: boolean;
    confirming: boolean;
  }>({
    loading: Boolean(bookingId),
    error: bookingId ? null : "No booking reference was supplied.",
    booking: null,
    selectedMethod: null,
    reservationConfirmed: false,
    confirming: false,
  });

  // Load booking details on mount
  useEffect(() => {
    if (!bookingId) {
      return;
    }

    let isMounted = true;

    async function loadBooking() {
      try {
        const response = await fetch(`/api/bookings/${bookingId}/details`);

        if (!response.ok) {
          throw new Error("Could not load booking details.");
        }

        const booking = (await response.json()) as BookingPaymentSummary;

        if (!isMounted) {
          return;
        }

        setState((prev) => ({
          ...prev,
          loading: false,
          booking,
          selectedMethod: booking.payment_method ?? prev.selectedMethod,
        }));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load booking details.",
        }));
      }
    }

    loadBooking();

    return () => {
      isMounted = false;
    };
  }, [bookingId]);

  const handleMethodSelect = (method: PaymentMethod) => {
    // Just select the method locally, don't submit
    setState((prev) => ({
      ...prev,
      selectedMethod: method,
      error: null,
    }));
  };

  const handleConfirmReservation = async () => {
    if (!state.booking || !state.selectedMethod) return;

    setState((prev) => ({
      ...prev,
      confirming: true,
      error: null,
    }));

    try {
      const response = await fetch("/api/payments/manual/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: state.booking.id,
          paymentMethod: state.selectedMethod,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to confirm reservation.";
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Response was not JSON, use default message
        }
        throw new Error(errorMessage);
      }

      setState((prev) => ({
        ...prev,
        confirming: false,
        reservationConfirmed: true,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to confirm reservation.",
        confirming: false,
      }));
    }
  };

  const totalFormatter = new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  });

  const currentPaymentState = state.booking ? getBookingPaymentState({
    payment_status: state.booking.payment_status,
    booking_status: state.booking.booking_status,
    payment_method: state.selectedMethod ?? state.booking.payment_method ?? null,
  }) : null;

  const showCustomerStatusState = !!state.booking && (currentPaymentState?.code === "under_review" || currentPaymentState?.code === "verified" || currentPaymentState?.code === "rejected" || currentPaymentState?.code === "receipt_required");
  const shouldShowBankFlow = !!state.booking && (state.selectedMethod === "bank_transfer" || state.booking.payment_method === "bank_transfer") && !showCustomerStatusState && !state.reservationConfirmed;
  const showCompletionScreen = state.reservationConfirmed && state.selectedMethod === "cash_at_gate";

  useEffect(() => {
    if (!showCompletionScreen) return;

    const redirectTimer = window.setTimeout(() => router.push("/"), 3000);
    return () => window.clearTimeout(redirectTimer);
  }, [router, showCompletionScreen]);

  return (
    <main className="booking-ui payment-page-root min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.08),_transparent_35%),_linear-gradient(180deg,_#f7f4ee_0%,_#f3efe7_100%)] px-4 py-8 text-slate-900 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition hover:border-slate-300 hover:bg-white active:translate-y-px"
          >
            <span aria-hidden="true">←</span>
            Back to Home
          </Link>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Payment</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            {state.loading ? "Loading your booking" : state.error && !state.selectedMethod ? "Error" : state.selectedMethod && !state.reservationConfirmed ? "Confirm Your Booking" : "Complete Your Booking"}
          </h1>
        </div>

        {/* Loading State */}
        {state.loading && (
          <div className="max-w-3xl rounded-[2rem] border border-slate-200 bg-white/90 p-6 text-center shadow-[0_20px_50px_rgba(15,23,42,0.04)]">
            <div className="mx-auto inline-block h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600"></div>
            <p className="mt-4 text-base text-slate-600">Loading your booking details...</p>
          </div>
        )}

        {/* Error State */}
        {state.error && !state.loading && (
          <div className="max-w-3xl rounded-[2rem] border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="font-semibold text-rose-900">{state.error}</p>
            <Link href="/book" className="mt-4 inline-block rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700">
              Start New Booking
            </Link>
          </div>
        )}

        {!state.loading && state.booking && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
            <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur-sm sm:p-6 lg:p-8">
              {!state.selectedMethod || state.error ? (
                <>
                  {state.error && state.selectedMethod && (
                    <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                      <p className="font-semibold text-rose-900">{state.error}</p>
                    </div>
                  )}
                  <PaymentMethodSelector
                    onSelect={handleMethodSelect}
                    loading={state.confirming}
                    disabled={state.reservationConfirmed}
                    selectedMethod={state.selectedMethod}
                  />
                </>
              ) : showCustomerStatusState ? (
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6">
                  {currentPaymentState?.code === "under_review" && (
                    <>
                      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Payment Under Review</div>
                      <h2 className="mt-3 text-3xl font-black text-slate-900">Payment Under Review</h2>
                      <p className="mt-3 text-base leading-7 text-slate-600">Your payment receipt has been submitted successfully. Your reservation will be confirmed after our team verifies your payment.</p>
                    </>
                  )}
                  {currentPaymentState?.code === "verified" && (
                    <>
                      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Payment Verified</div>
                      <h2 className="mt-3 text-3xl font-black text-slate-900">Payment Verified</h2>
                      <p className="mt-3 text-base leading-7 text-slate-600">Your payment has been verified and your reservation is confirmed.</p>
                    </>
                  )}
                  {currentPaymentState?.code === "rejected" && (
                    <>
                      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-700">Payment Verification Failed</div>
                      <h2 className="mt-3 text-3xl font-black text-slate-900">Payment Verification Failed</h2>
                      <p className="mt-3 text-base leading-7 text-slate-600">Your payment could not be verified. Please upload a new receipt and try again.</p>
                    </>
                  )}
                  {currentPaymentState?.code === "receipt_required" && (
                    <>
                      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">New Payment Receipt Required</div>
                      <h2 className="mt-3 text-3xl font-black text-slate-900">New Payment Receipt Required</h2>
                      <p className="mt-3 text-base leading-7 text-slate-600">Please upload a replacement receipt for verification.</p>
                    </>
                  )}
                </div>
              ) : !state.reservationConfirmed ? (
                <div className="space-y-5">
                  <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
                    <div className="text-sm font-semibold text-emerald-900">Selected Payment Method</div>
                    <div className="mt-2 text-xl font-semibold text-emerald-700">
                      {state.selectedMethod === "bank_transfer" ? "Bank Transfer / EFT" : "Pay at the Gate – Cash"}
                    </div>
                    <p className="mt-2 text-sm text-emerald-800">
                      {state.selectedMethod === "bank_transfer"
                        ? "You will pay securely by bank transfer before your visit."
                        : "You will pay the full booking amount in cash when you arrive at Chamlija."}
                    </p>
                  </div>

                  {state.error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                      <p className="font-semibold text-rose-900">{state.error}</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleConfirmReservation}
                      disabled={!state.selectedMethod || state.confirming}
                      className="w-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-3.5 text-base font-semibold text-white shadow-[0_16px_30px_rgba(16,185,129,0.22)] transition hover:translate-y-[-1px] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                    >
                      {state.confirming ? "Confirming..." : "Confirm Reservation"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setState((prev) => ({ ...prev, selectedMethod: null, error: null }))}
                      disabled={state.confirming}
                      className="rounded-full border border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Change Payment Method
                    </button>
                  </div>
                </div>
              ) : showCompletionScreen ? (
                <div className="mx-auto max-w-xl rounded-[2rem] border border-emerald-200 bg-emerald-50 p-8 text-center shadow-[0_20px_45px_rgba(16,185,129,0.12)]">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-3xl font-black text-white">✓</div>
                  <h2 className="mt-5 text-3xl font-black tracking-tight text-emerald-950">Booking Completed</h2>
                  <p className="mx-auto mt-3 max-w-md text-base leading-7 text-emerald-900/80">Thank you. Your booking has been completed successfully. You will return to the home page shortly.</p>
                  <div className="mt-6 rounded-2xl border border-emerald-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Reservation reference</div>
                    <div className="mt-2 break-words font-mono text-xl font-black text-slate-900">{state.booking.reservation_code || state.booking.id}</div>
                  </div>
                  <p className="mt-4 text-sm font-medium text-emerald-800">Redirecting to home in 3 seconds...</p>
                </div>
              ) : state.selectedMethod === "bank_transfer" ? (
                <BankTransferDisplay booking={state.booking} />
              ) : (
                <CashAtGateDisplay booking={state.booking} />
              )}
            </section>

            <aside className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur-sm sm:p-6 xl:sticky xl:top-6 xl:h-fit">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Booking</div>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">Summary</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Active
                </span>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-slate-600">
                    <span aria-hidden="true">🏷️</span>
                    <span className="text-sm font-medium">Reference</span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-slate-900">{state.booking.reservation_code || state.booking.id}</span>
                </div>

                {state.booking.booking_date && (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-2 text-slate-600">
                      <span aria-hidden="true">📅</span>
                      <span className="text-sm font-medium">Date</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{state.booking.booking_date}</span>
                  </div>
                )}

                {state.booking.booking_time && (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-2 text-slate-600">
                      <span aria-hidden="true">🕒</span>
                      <span className="text-sm font-medium">Time</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{state.booking.booking_time}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-slate-600">
                    <span aria-hidden="true">👥</span>
                    <span className="text-sm font-medium">Guests</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {Number(state.booking.adults ?? 0) + Number(state.booking.children_3_plus ?? 0) + Number(state.booking.children_under_3 ?? 0)}
                  </span>
                </div>
              </div>

              <div className="mt-6 rounded-[1.5rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Total Amount</div>
                <div className="mt-2 text-3xl font-black tracking-tight text-slate-900">{totalFormatter.format(Number(state.booking.total_price ?? 0))}</div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">Loading payment details...</div>}>
      <PaymentContent />
    </Suspense>
  );
}
