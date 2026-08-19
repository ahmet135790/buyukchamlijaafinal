import { NextResponse } from "next/server";
import { getAvailableTimeSlots, getPicnicAreaById, getSuggestedDates } from "@/lib/booking/service";
import { isValidBookingTime } from "@/lib/booking/hours";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const areaId = searchParams.get("areaId");
  const time = searchParams.get("time");
  const adults = Number(searchParams.get("adults") ?? 0);
  const children3Plus = Number(searchParams.get("children3Plus") ?? 0);
  const childrenUnder3 = Number(searchParams.get("childrenUnder3") ?? 0);

  if (!date || (!areaId && !time)) {
    return NextResponse.json({ error: areaId ? "Date is required." : "Date and time are required." }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (time && !isValidBookingTime(time))) {
    return NextResponse.json({ error: "Please provide a valid booking date and time." }, { status: 400 });
  }

  const selectedDate = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(selectedDate.getTime()) || selectedDate < today) {
    return NextResponse.json({ error: "Booking date cannot be in the past." }, { status: 400 });
  }

  if (![adults, children3Plus, childrenUnder3].every((value) => Number.isFinite(value) && value >= 0) || adults + children3Plus + childrenUnder3 <= 0) {
    return NextResponse.json({ error: "At least one guest must be present." }, { status: 400 });
  }

  if (!areaId) {
    return NextResponse.json({
      areaId: null,
      date,
      time,
      availableSlots: [time],
      suggestedDates: [],
      areaName: null,
      entryOnly: true,
      isAvailable: true,
    });
  }

  const area = await getPicnicAreaById(areaId);

  if (!area) {
    return NextResponse.json({ error: "This picnic area is not available." }, { status: 404 });
  }

  const availableSlots = await getAvailableTimeSlots(date, areaId);
  const suggestedDates = availableSlots.length === 0 ? await getSuggestedDates(areaId, date, 4) : [];

  return NextResponse.json({
    areaId,
    date,
    availableSlots,
    suggestedDates,
    areaName: area.name,
    isAvailable: time ? availableSlots.includes(time) : null,
  });
}
