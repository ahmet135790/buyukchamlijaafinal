"use client";

import { Suspense, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProductRecord } from "@/lib/products/types";
import { BOOKING_TIME_SLOTS } from "@/lib/booking/hours";
import { calculateBookingPriceBreakdown, formatCurrency } from "@/lib/booking/pricing";

const initialForm = {
  fullName: "",
  phoneNumber: "",
  emailAddress: "",
  bookingDate: "",
  bookingTime: "",
  adults: "1",
  children3Plus: "0",
  childrenUnder3: "0",
  picnicAreaId: "",
  customerNotes: "",
};

const PRODUCT_CATEGORY_LABELS: Record<string, string> = {
  picnic_area: "Picnic Areas",
  equipment: "Equipment",
  paid_activity: "Paid Activities",
  tent_event_area: "Tents & Event Areas",
  photo_shoot: "Photo Shoots",
  free_activity: "Free Activities",
};

function BookingPrefill({
  products,
  setForm,
}: {
  products: ProductRecord[];
  setForm: Dispatch<SetStateAction<typeof initialForm>>;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const areaParam = searchParams.get("area");
    const adultsParam = searchParams.get("adults");
    const childrenParam = searchParams.get("children3Plus");
    const dateHint = searchParams.get("dateHint");

    if (!areaParam && !adultsParam && !childrenParam && !dateHint) {
      return;
    }

    setForm((previous) => ({
      ...previous,
      adults: adultsParam ?? previous.adults,
      children3Plus: childrenParam ?? previous.children3Plus,
      picnicAreaId: areaParam
        ? products.some((product) => product.name === areaParam)
          ? products.find((product) => product.name === areaParam)?.id ?? previous.picnicAreaId
          : previous.picnicAreaId
        : previous.picnicAreaId,
      bookingDate: dateHint ? previous.bookingDate || "" : previous.bookingDate,
    }));
  }, [products, searchParams, setForm]);

  return null;
}

export default function BookingPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [equipmentQuantities, setEquipmentQuantities] = useState<Record<string, number>>({});
  const [selectedPaidActivityId, setSelectedPaidActivityId] = useState<string>("");
  const [selectedTentAreaId, setSelectedTentAreaId] = useState<string>("");
  const [selectedPhotoShootId, setSelectedPhotoShootId] = useState<string>("");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);
  const [availabilityState, setAvailabilityState] = useState<{
    checking: boolean;
    message: string;
    isAvailable: boolean | null;
    availableSlots: string[];
    suggestedDates: string[];
    error: string | null;
  }>({
    checking: false,
    message: "",
    isAvailable: null,
    availableSlots: [],
    suggestedDates: [],
    error: null,
  });
  const [submitState, setSubmitState] = useState<{
    isSubmitting: boolean;
    success: boolean;
    message: string | null;
    bookingId: string | null;
  }>({ isSubmitting: false, success: false, message: null, bookingId: null });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadProducts() {
      try {
        setLoadingProducts(true);
        const response = await fetch("/api/products", { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok || payload.error) {
          setProductError(payload.error || "Unable to load products.");
          setProducts([]);
          return;
        }

        setProducts(Array.isArray(payload.products) ? payload.products : []);
      } catch {
        setProductError("Unable to load product catalog at the moment.");
      } finally {
        setLoadingProducts(false);
      }
    }

    void loadProducts();
  }, []);

  const adults = Number(form.adults || 0);
  const children3Plus = Number(form.children3Plus || 0);
  const childrenUnder3 = Number(form.childrenUnder3 || 0);
  const totalGuests = adults + children3Plus + childrenUnder3;

  const picnicAreas = useMemo(
    () => products.filter((product) => product.category === "picnic_area" && product.is_active && product.is_bookable),
    [products],
  );

  const selectedArea = useMemo(
    () => picnicAreas.find((area) => area.id === form.picnicAreaId) ?? null,
    [form.picnicAreaId, picnicAreas],
  );

  const bookingPriceBreakdown = useMemo(
    () =>
      calculateBookingPriceBreakdown({
        adults,
        children3Plus,
        childrenUnder3,
        selectedArea,
        equipmentQuantities,
        products,
        selectedPaidActivityId,
        selectedTentAreaId,
        selectedPhotoShootId,
        bookingDate: form.bookingDate || undefined,
        creationDate: new Date().toISOString().split("T")[0],
      }),
    [adults, children3Plus, childrenUnder3, selectedArea, equipmentQuantities, products, selectedPaidActivityId, selectedTentAreaId, selectedPhotoShootId, form.bookingDate],
  );

  const entranceFeeTotal = bookingPriceBreakdown.entranceFeeTotal;

  const freeActivities = useMemo(
    () => products.filter((product) => product.category === "free_activity" && product.is_active),
    [products],
  );

  const paidProductGroups = useMemo(
    () => [
      "equipment",
      "paid_activity",
      "tent_event_area",
      "photo_shoot",
    ].map((category) => ({
      category,
      label: PRODUCT_CATEGORY_LABELS[category],
      items: products.filter((product) => product.category === category && product.is_active && product.is_bookable),
    })),
    [products],
  );

  const bookingSummaryData = bookingPriceBreakdown;
  const priceTotal = bookingSummaryData.total;

  const todayIso = new Date().toISOString().slice(0, 10);

  function updateField(field: keyof typeof initialForm, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: "" }));
    if (field === "bookingDate" || field === "bookingTime" || field === "picnicAreaId") {
      setAvailabilityState((previous) => ({ ...previous, message: "", isAvailable: null, availableSlots: [], suggestedDates: [], error: null }));
    }
  }

  function validateForm(): Record<string, string> {
    const nextErrors: Record<string, string> = {};

    if (!form.fullName.trim()) {
      nextErrors.fullName = "Full name is required.";
    }

    if (!form.phoneNumber.trim()) {
      nextErrors.phoneNumber = "Phone number is required.";
    }

    if (!form.emailAddress.trim()) {
      nextErrors.emailAddress = "Email address is required.";
    }

    if (!form.bookingDate) {
      nextErrors.bookingDate = "Booking date is required.";
    } else {
      const selectedDate = new Date(`${form.bookingDate}T00:00:00`);
      const today = new Date(`${todayIso}T00:00:00`);

      if (Number.isNaN(selectedDate.getTime()) || selectedDate < today) {
        nextErrors.bookingDate = "Booking date cannot be in the past.";
      }
    }

    if (!form.bookingTime) {
      nextErrors.bookingTime = "Booking time is required.";
    }

    if (adults < 0 || children3Plus < 0 || childrenUnder3 < 0) {
      nextErrors.guests = "Guest counts cannot be negative.";
    }

    if (totalGuests <= 0) {
      nextErrors.guests = "At least one paying or free guest must be present.";
    }

    if (selectedArea && selectedArea.capacity !== null && selectedArea.capacity !== undefined && totalGuests > Number(selectedArea.capacity)) {
      nextErrors.picnicAreaId = "This picnic area cannot accommodate the selected guest count.";
    }

    return nextErrors;
  }

  async function fetchAvailability(dateValue: string, areaId: string, timeValue: string) {
    const params = new URLSearchParams({
      date: dateValue,
      time: timeValue,
      adults: String(adults),
      children3Plus: String(children3Plus),
      childrenUnder3: String(childrenUnder3),
    });
    if (areaId) params.set("areaId", areaId);
    const response = await fetch(`/api/bookings/availability?${params.toString()}`);
    const payload = await response.json();

    return {
      slots: Array.isArray(payload?.availableSlots) ? (payload.availableSlots as string[]) : [],
      suggestions: Array.isArray(payload?.suggestedDates) ? (payload.suggestedDates as string[]) : [],
    };
  }

  async function checkAvailability() {
    const nextErrors = validateForm();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    if (!form.bookingDate || !form.bookingTime) {
      setErrors({ bookingDate: "Please provide a valid date and time." });
      return;
    }

    setAvailabilityState({
      checking: true,
      message: "Checking availability...",
      isAvailable: null,
      availableSlots: [],
      suggestedDates: [],
      error: null,
    });

    const { slots, suggestions } = await fetchAvailability(form.bookingDate, form.picnicAreaId, form.bookingTime);

    if (slots.includes(form.bookingTime)) {
      setAvailabilityState({
        checking: false,
        message: form.picnicAreaId ? "This picnic area is available." : "Entry-only booking is available.",
        isAvailable: true,
        availableSlots: slots,
        suggestedDates: suggestions,
        error: null,
      });
      return;
    }

    setAvailabilityState({
      checking: false,
      message: "This area is already booked for the selected date and time. Please choose another area or time.",
      isAvailable: false,
      availableSlots: slots,
      suggestedDates: suggestions,
      error: "Please choose another time or date.",
    });
  }

  // Selecting an already-confirmed available slot updates booking_time without discarding the results.
  function handleSlotSelect(slot: string) {
    setForm((previous) => ({ ...previous, bookingTime: slot }));
    setErrors((previous) => ({ ...previous, bookingTime: "" }));
    setAvailabilityState((previous) => ({
      ...previous,
      message: form.picnicAreaId ? "This picnic area is available." : "Entry-only booking is available.",
      isAvailable: true,
      error: null,
    }));
  }

  // Selecting a suggested date re-checks availability for that date so the user can then pick a time.
  async function handleDateSelect(date: string) {
    setForm((previous) => ({ ...previous, bookingDate: date, bookingTime: "" }));
    setErrors((previous) => ({ ...previous, bookingDate: "", bookingTime: "" }));

    if (!form.picnicAreaId) {
      return;
    }

    setAvailabilityState({
      checking: true,
      message: "Checking availability...",
      isAvailable: null,
      availableSlots: [],
      suggestedDates: [],
      error: null,
    });

    const { slots, suggestions } = await fetchAvailability(date, form.picnicAreaId, form.bookingTime);

    setAvailabilityState({
      checking: false,
      message: slots.length > 0 ? "This picnic area is available. Please select a time." : "This area is already booked for the selected date and time. Please choose another area or time.",
      isAvailable: slots.length > 0 ? null : false,
      availableSlots: slots,
      suggestedDates: suggestions,
      error: slots.length > 0 ? null : "Please choose another date.",
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateForm();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    if (form.picnicAreaId && availabilityState.isAvailable !== true) {
      setAvailabilityState((previous) => ({
        ...previous,
        checking: false,
        message: "Please check availability before continuing.",
        isAvailable: false,
        error: "Please verify the selected time slot before proceeding.",
      }));
      return;
    }

    setSubmitState({ isSubmitting: true, success: false, message: null, bookingId: null });

    // Encode equipment quantities as "id:qty" format
    const selectedEquipmentIds = Object.entries(equipmentQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => `${id}:${qty}`);

    const response = await fetch("/api/bookings/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: form.fullName,
        phone_number: form.phoneNumber,
        email: form.emailAddress,
        booking_date: form.bookingDate,
        booking_time: form.bookingTime,
        adults,
        children_3_plus: children3Plus,
        children_under_3: childrenUnder3,
        picnic_area_id: form.picnicAreaId || null,
        customer_notes: form.customerNotes,
        selected_equipment_ids: selectedEquipmentIds,
        selected_paid_activity_id: selectedPaidActivityId || null,
        selected_tent_area_id: selectedTentAreaId || null,
        selected_photo_shoot_id: selectedPhotoShootId || null,
      }),
    });

    const result = await response.json();

    if (!response.ok || result.error) {
      setSubmitState({
        isSubmitting: false,
        success: false,
        message: result.error || "Unable to submit booking at this time.",
        bookingId: null,
      });
      return;
    }

    setSubmitState({
      isSubmitting: false,
      success: true,
      message: "Your booking has been submitted successfully.",
      bookingId: result.bookingId ?? null,
    });

    router.push(`/book/payment?bookingId=${encodeURIComponent(result.bookingId ?? "")}`);
  }

  return (
    <>
      <Suspense fallback={null}>
        <BookingPrefill products={products} setForm={setForm} />
      </Suspense>

      <main className="booking-ui min-h-screen bg-cream px-3 py-6 text-charcoal sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-forest/15 bg-white px-4 py-2.5 text-sm font-semibold text-forest shadow-sm transition hover:border-forest/30 hover:bg-forest/5 hover:text-terracotta active:translate-y-px active:shadow-none"
          >
            <span aria-hidden="true" className="text-base leading-none">←</span>
            <span>Back to Home</span>
          </Link>
          <div className="self-start rounded-full border border-forest/15 bg-white px-3 py-1.5 text-sm font-medium text-charcoal/60 sm:self-auto">
            Customer Reservation
          </div>
        </div>

        <div className="mb-8 space-y-2 sm:mb-10">
          <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-terracotta sm:text-xs">Reservation</p>
          <h1 className="text-2xl font-semibold tracking-tight text-forest-dark sm:text-3xl lg:text-4xl">Create a reservation for Buyuk Chamlija</h1>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:gap-8">
          <section className="border border-forest/10 bg-white p-4 shadow-[0_18px_40px_rgba(20,37,29,0.05)] sm:p-6 lg:p-9">
            <div className="space-y-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-terracotta">Customer Information</p>
                <h2 className="mt-2 text-2xl font-semibold text-forest-dark">Your Details</h2>
              </div>

              <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor="fullName" className="mb-2 block text-sm font-semibold text-charcoal/80">Full Name</label>
                  <input
                    id="fullName"
                    value={form.fullName}
                    onChange={(event) => updateField("fullName", event.target.value)}
                    className="w-full min-h-12 rounded-xl border border-forest/15 bg-cream/40 px-4 py-3 text-base outline-none transition focus:border-forest focus:bg-white"
                    placeholder="Jane Smith"
                  />
                  {errors.fullName && <p className="mt-2 text-sm text-terracotta">{errors.fullName}</p>}
                </div>

                <div>
                  <label htmlFor="phoneNumber" className="mb-2 block text-sm font-semibold text-charcoal/80">Phone Number</label>
                  <input
                    id="phoneNumber"
                    value={form.phoneNumber}
                    onChange={(event) => updateField("phoneNumber", event.target.value)}
                    className="w-full min-h-12 rounded-xl border border-forest/15 bg-cream/40 px-4 py-3 text-base outline-none transition focus:border-forest focus:bg-white"
                    placeholder="+27 82 123 4567"
                  />
                  {errors.phoneNumber && <p className="mt-2 text-sm text-terracotta">{errors.phoneNumber}</p>}
                </div>

                <div>
                  <label htmlFor="emailAddress" className="mb-2 block text-sm font-semibold text-charcoal/80">Email Address</label>
                  <input
                    id="emailAddress"
                    type="email"
                    value={form.emailAddress}
                    onChange={(event) => updateField("emailAddress", event.target.value)}
                    className="w-full min-h-12 rounded-xl border border-forest/15 bg-cream/40 px-4 py-3 text-base outline-none transition focus:border-forest focus:bg-white"
                    placeholder="name@example.com"
                  />
                  {errors.emailAddress && <p className="mt-2 text-sm text-terracotta">{errors.emailAddress}</p>}
                </div>
              </div>

              <div className="space-y-6 border-t border-forest/10 pt-8">
                <div>
                  <p className="text-xs font-medium tracking-[0.22em] text-terracotta">VISIT DETAILS</p>
                  <h2 className="mt-2 text-2xl font-semibold text-forest-dark">Visit Details</h2>
                </div>

                <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
                  <div>
                    <label htmlFor="bookingDate" className="mb-2 block text-sm font-semibold text-charcoal/80">Reservation Date</label>
                    <input
                      id="bookingDate"
                      type="date"
                      min={todayIso}
                      value={form.bookingDate}
                      onChange={(event) => updateField("bookingDate", event.target.value)}
                      className="w-full min-h-12 rounded-xl border border-forest/15 bg-cream/40 px-4 py-3 text-base outline-none transition focus:border-forest focus:bg-white"
                    />
                    {errors.bookingDate && <p className="mt-2 text-sm text-terracotta">{errors.bookingDate}</p>}
                  </div>

                  <div>
                    <label htmlFor="bookingTime" className="mb-2 block text-sm font-semibold text-charcoal/80">Arrival Time</label>
                    <select
                      id="bookingTime"
                      value={form.bookingTime}
                      onChange={(event) => updateField("bookingTime", event.target.value)}
                      className="w-full min-h-12 rounded-xl border border-forest/15 bg-cream/40 px-4 py-3 text-base outline-none transition focus:border-forest focus:bg-white"
                    >
                      <option value="">Select a time</option>
                      {form.bookingDate && BOOKING_TIME_SLOTS.map((time) => <option key={time} value={time}>{time}</option>)}
                    </select>
                    {errors.bookingTime && <p className="mt-2 text-sm text-terracotta">{errors.bookingTime}</p>}
                  </div>
                </div>

                <div className="grid gap-4 sm:gap-5 md:grid-cols-3">
                  {[
                    ["adults", "Adults"],
                    ["children3Plus", "Children 3+"],
                    ["childrenUnder3", "Children Under 3"],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label htmlFor={key} className="mb-2 block text-sm font-semibold text-charcoal/80">{label}</label>
                      <input
                        id={key}
                        type="number"
                        min={0}
                        value={form[key as keyof typeof initialForm]}
                        onChange={(event) => updateField(key as keyof typeof initialForm, event.target.value)}
                        className="w-full min-h-12 rounded-xl border border-forest/15 bg-cream/40 px-4 py-3 text-base outline-none transition focus:border-forest focus:bg-white"
                      />
                    </div>
                  ))}
                </div>

                {errors.guests && <p className="text-sm text-terracotta">{errors.guests}</p>}

                <div>
                  <label htmlFor="picnicAreaId" className="mb-2 block text-sm font-semibold text-charcoal/80">Picnic Area <span className="font-normal text-charcoal/50">(optional)</span></label>
                  {loadingProducts ? (
                    <div className="border border-forest/15 bg-cream/40 px-4 py-3 text-sm text-charcoal/60">Loading picnic areas...</div>
                  ) : productError ? (
                    <div className="border border-terracotta/30 bg-terracotta/5 px-4 py-3 text-sm text-terracotta">{productError}</div>
                  ) : (
                    <div className="space-y-2">
                      {picnicAreas.map((area) => (
                        <label key={area.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-forest/15 bg-white px-3 py-3 transition hover:border-forest/40 hover:bg-forest/5 sm:px-4">
                          <input
                            type="radio"
                            name="picnicArea"
                            value={area.id}
                            checked={form.picnicAreaId === area.id}
                            onChange={() => updateField("picnicAreaId", area.id)}
                            className="h-4 w-4 accent-forest"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-forest-dark">{area.name}</span>
                            {area.capacity && <span className="block text-xs text-charcoal/50">Capacity: {area.capacity} guests</span>}
                          </span>
                          <span className="shrink-0 text-sm font-bold text-forest">ZAR {Number(area.price ?? 0).toLocaleString()}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {errors.picnicAreaId && <p className="mt-2 text-sm text-terracotta">{errors.picnicAreaId}</p>}
                </div>

                <div className="space-y-6 pt-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-terracotta">Additional Options</p>
                    <h3 className="mt-2 text-xl font-semibold text-forest-dark">Select your add-ons</h3>
                  </div>

                  {paidProductGroups.map((group) => (
                    <div key={group.category} className="border border-forest/10 bg-cream/40 p-5">
                      <p className="mb-3 text-xs font-medium tracking-[0.2em] text-charcoal/60">{group.label}</p>

                      {group.items.length === 0 ? (
                        <p className="text-sm text-charcoal/50">No {group.label.toLowerCase()} are currently available.</p>
                      ) : group.category === "equipment" ? (
                        <div className="space-y-3">
                          {group.items.map((item) => {
                            const qty = equipmentQuantities[item.id] || 0;
                            return (
                              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-forest/10 bg-white px-3 py-3 sm:px-4">
                                <span className="min-w-0">
                                  <span className="block text-sm font-semibold text-forest-dark">{item.name}</span>
                                  <span className="block text-xs text-charcoal/50">ZAR {Number(item.price ?? 0).toLocaleString()} each</span>
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEquipmentQuantities((current) => ({
                                        ...current,
                                        [item.id]: Math.max(0, (current[item.id] || 0) - 1),
                                      }))
                                    }
                                    disabled={qty === 0}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-forest/20 text-lg font-bold text-forest transition hover:bg-forest/10 disabled:cursor-not-allowed disabled:border-forest/10 disabled:text-charcoal/35"
                                  >
                                    −
                                  </button>
                                  <span className="w-8 text-center text-sm font-semibold text-forest-dark">{qty}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEquipmentQuantities((current) => ({
                                        ...current,
                                        [item.id]: (current[item.id] || 0) + 1,
                                      }))
                                    }
                                    className="flex h-10 w-10 items-center justify-center rounded-full bg-forest text-lg font-bold text-white transition hover:bg-forest-dark active:scale-[0.98]"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <select
                          value={
                            group.category === "paid_activity"
                              ? selectedPaidActivityId
                              : group.category === "tent_event_area"
                                ? selectedTentAreaId
                                : selectedPhotoShootId
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            if (group.category === "paid_activity") setSelectedPaidActivityId(value);
                            if (group.category === "tent_event_area") setSelectedTentAreaId(value);
                            if (group.category === "photo_shoot") setSelectedPhotoShootId(value);
                          }}
                          className="w-full min-h-12 rounded-xl border border-forest/15 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-forest"
                        >
                          <option value="">No selection</option>
                          {group.items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} — ZAR {Number(item.price ?? 0).toLocaleString()}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}

                  {freeActivities.length > 0 && (
                    <div className="border border-olive/25 bg-olive/5 p-5">
                      <p className="mb-3 text-xs font-medium tracking-[0.2em] text-olive">Free Activities</p>
                      <div className="space-y-2 text-sm text-charcoal/70">
                        {freeActivities.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 border border-olive/15 bg-white px-4 py-2.5">
                            <span>{item.name}</span>
                            <span className="font-semibold text-olive">Free</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="customerNotes" className="mb-2 block text-sm font-semibold text-charcoal/80">Customer Notes</label>
                  <textarea
                    id="customerNotes"
                    value={form.customerNotes}
                    onChange={(event) => updateField("customerNotes", event.target.value)}
                    className="min-h-[120px] w-full rounded-xl border border-forest/15 bg-cream/40 px-4 py-3 text-base outline-none transition focus:border-forest focus:bg-white"
                    placeholder="Let us know any special requests or celebrations."
                  />
                </div>
              </div>

              <div className="border border-forest/15 bg-forest/5 p-5">
                <button
                  type="button"
                  onClick={checkAvailability}
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-forest px-6 py-3 text-sm font-semibold tracking-[0.08em] text-white shadow-lg shadow-forest/20 transition hover:bg-forest-dark disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={availabilityState.checking}
                >
                  {availabilityState.checking ? "Checking availability..." : "Check Availability"}
                </button>

                {availabilityState.message && (
                  <p className={`mt-3 text-sm ${availabilityState.isAvailable === false ? "text-terracotta" : "text-forest"}`}>
                    {availabilityState.message}
                  </p>
                )}

                {availabilityState.availableSlots.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-charcoal/70">Available times:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {availabilityState.availableSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => handleSlotSelect(slot)}
                          className={`min-h-10 rounded-full border px-3 py-2 text-xs font-semibold ${
                            form.bookingTime === slot
                              ? "border-forest bg-forest text-white"
                              : "border-forest/20 bg-white text-charcoal/70"
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                    <button
                      type="submit"
                      disabled={!form.bookingTime || availabilityState.isAvailable !== true || submitState.isSubmitting}
                      className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-forest px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-forest/20 transition hover:bg-forest-dark disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      {submitState.isSubmitting ? "Continuing..." : "Continue Booking"}
                    </button>
                  </div>
                )}

                {availabilityState.suggestedDates.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-charcoal/70">Suggested alternative dates:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {availabilityState.suggestedDates.map((date) => (
                        <button
                          key={date}
                          type="button"
                          onClick={() => void handleDateSelect(date)}
                          className={`min-h-10 rounded-full border px-3 py-2 text-xs font-semibold ${
                            form.bookingDate === date
                              ? "border-forest bg-forest text-white"
                              : "border-forest/20 bg-white text-charcoal/70"
                          }`}
                        >
                          {new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-[1.75rem] border border-forest/10 bg-white p-4 shadow-[0_18px_40px_rgba(20,37,29,0.05)] sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[10px] font-medium tracking-[0.22em] text-terracotta sm:text-xs">Reservation Summary</p>
                <span className="rounded-full bg-forest/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-forest">Total</span>
              </div>

              <div className="space-y-4 text-sm text-charcoal/75">
                <div className="rounded-2xl border border-forest/10 bg-cream/30 p-3">
                  <p className="mb-2 text-[10px] font-medium tracking-[0.18em] text-charcoal/50 sm:text-xs">Guests</p>
                  {adults > 0 && (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span>{adults} Adult{adults === 1 ? "" : "s"}</span>
                      <span className="font-semibold text-forest-dark">{formatCurrency(bookingPriceBreakdown.adultTotal)}</span>
                    </div>
                  )}
                  {children3Plus > 0 && (
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span>{children3Plus} Child{children3Plus === 1 ? "" : "ren"} 3+</span>
                      <span className="font-semibold text-forest-dark">{formatCurrency(bookingPriceBreakdown.child3PlusTotal)}</span>
                    </div>
                  )}
                  {childrenUnder3 > 0 && (
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span>{childrenUnder3} Child{childrenUnder3 === 1 ? "" : "ren"} under 3</span>
                      <span className="font-semibold text-forest-dark">Free</span>
                    </div>
                  )}
                  {totalGuests === 0 && <div className="text-xs italic text-charcoal/40">No guests selected yet</div>}
                </div>

                {selectedArea && (
                  <div className="rounded-2xl border border-forest/10 bg-cream/30 p-3">
                    <p className="mb-2 text-[10px] font-medium tracking-[0.18em] text-charcoal/50 sm:text-xs">Picnic Area</p>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="break-words font-medium text-forest-dark">{selectedArea.name}</span>
                      <span className="font-semibold text-forest-dark">{formatCurrency(bookingPriceBreakdown.areaTotal)}</span>
                    </div>
                  </div>
                )}

                {bookingPriceBreakdown.lineItems.filter((item) => item.kind === "equipment").length > 0 && (
                  <div className="rounded-2xl border border-forest/10 bg-cream/30 p-3">
                    <p className="mb-2 text-[10px] font-medium tracking-[0.18em] text-charcoal/50 sm:text-xs">Equipment</p>
                    <div className="space-y-3">
                      {bookingPriceBreakdown.lineItems
                        .filter((item) => item.kind === "equipment")
                        .map((item) => (
                          <div key={item.label} className="rounded-xl border border-forest/10 bg-white p-2.5">
                            <div className="flex items-start justify-between gap-3 text-xs">
                              <span className="break-words font-medium text-forest-dark">{item.label}</span>
                              <span className="shrink-0 font-semibold text-forest-dark">{formatCurrency(item.total)}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-charcoal/60">
                              <span>{item.quantity} × {formatCurrency(item.unitPrice)}</span>
                              <span className="font-medium">{formatCurrency(item.total)}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {bookingPriceBreakdown.lineItems.filter((item) => item.kind === "single-item").length > 0 && (
                  <div className="rounded-2xl border border-forest/10 bg-cream/30 p-3">
                    <p className="mb-2 text-[10px] font-medium tracking-[0.18em] text-charcoal/50 sm:text-xs">Services</p>
                    <div className="space-y-2">
                      {bookingPriceBreakdown.lineItems
                        .filter((item) => item.kind === "single-item")
                        .map((item) => (
                          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                            <span className="break-words font-medium text-forest-dark">{item.label}</span>
                            <span className="font-semibold text-forest-dark">{formatCurrency(item.total)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3 rounded-2xl border border-forest/10 bg-forest/5 p-3">
                  <div className="flex justify-between gap-3 text-sm">
                    <span>Entrance Fees</span>
                    <span className="font-semibold text-forest-dark">{formatCurrency(bookingPriceBreakdown.entranceFeeTotal)}</span>
                  </div>
                  {bookingPriceBreakdown.areaTotal > 0 && (
                    <div className="flex justify-between gap-3 text-sm">
                      <span>Picnic Area</span>
                      <span className="font-semibold text-forest-dark">{formatCurrency(bookingPriceBreakdown.areaTotal)}</span>
                    </div>
                  )}
                  {bookingPriceBreakdown.equipmentTotal > 0 && (
                    <div className="flex justify-between gap-3 text-sm">
                      <span>Equipment</span>
                      <span className="font-semibold text-forest-dark">{formatCurrency(bookingPriceBreakdown.equipmentTotal)}</span>
                    </div>
                  )}
                  {bookingPriceBreakdown.singleItemTotal > 0 && (
                    <div className="flex justify-between gap-3 text-sm">
                      <span>Services</span>
                      <span className="font-semibold text-forest-dark">{formatCurrency(bookingPriceBreakdown.singleItemTotal)}</span>
                    </div>
                  )}

                  <div className="border-t border-forest/15 pt-3">
                    <div className="flex items-center justify-between text-sm">
                      <span>Subtotal</span>
                      <span className="font-semibold text-forest-dark">{formatCurrency(bookingPriceBreakdown.subtotal)}</span>
                    </div>
                  </div>

                  {bookingPriceBreakdown.discountAmount > 0 && bookingPriceBreakdown.discountPercentage > 0 && (
                    <div className="flex items-center justify-between text-sm text-emerald-700">
                      <span>Early Booking Discount ({bookingPriceBreakdown.discountPercentage}%)</span>
                      <span className="font-semibold">-{formatCurrency(bookingPriceBreakdown.discountAmount)}</span>
                    </div>
                  )}

                  <div className="border-t border-forest/15 pt-3">
                    <div className="flex items-center justify-between text-base font-bold text-forest-dark sm:text-lg">
                      <span>Total</span>
                      <span>{formatCurrency(bookingPriceBreakdown.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitState.isSubmitting}
              className="w-full min-h-12 rounded-full bg-terracotta px-5 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-lg shadow-terracotta/25 transition hover:bg-terracotta/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitState.isSubmitting ? "Submitting..." : "Continue to Payment"}
            </button>

            {submitState.message && (
              <div className={`border px-4 py-3 text-sm ${submitState.success ? "border-forest/20 bg-forest/5 text-forest" : "border-terracotta/30 bg-terracotta/5 text-terracotta"}`}>
                {submitState.message}
              </div>
            )}
          </aside>
        </form>
      </div>
    </main>
    </>
  );
}
