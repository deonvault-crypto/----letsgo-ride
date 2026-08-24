export type ZimbabweServiceArea = { id: string; name: string; aliases?: string[] };

export const ZIMBABWE_SERVICE_AREAS: ZimbabweServiceArea[] = [
  { id: "harare", name: "Harare", aliases: ["Hre"] },
  { id: "bulawayo", name: "Bulawayo", aliases: ["Byo"] },
  { id: "chitungwiza", name: "Chitungwiza" },
  { id: "mutare", name: "Mutare" },
  { id: "gweru", name: "Gweru" },
  { id: "kwekwe", name: "Kwekwe" },
  { id: "masvingo", name: "Masvingo" },
  { id: "kadoma", name: "Kadoma" },
  { id: "marondera", name: "Marondera" },
  { id: "victoria-falls", name: "Victoria Falls" },
  { id: "hwange", name: "Hwange" },
  { id: "bindura", name: "Bindura" },
  { id: "chinhoyi", name: "Chinhoyi" },
  { id: "kariba", name: "Kariba" },
  { id: "zvishavane", name: "Zvishavane" },
  { id: "beitbridge", name: "Beitbridge" },
  { id: "rusape", name: "Rusape" },
  { id: "chegutu", name: "Chegutu" },
  { id: "gwanda", name: "Gwanda" },
  { id: "norton", name: "Norton" },
];

export type VehicleOption = { id: string; name: string };

export const COURIER_VEHICLE_TYPES: VehicleOption[] = [
  { id: "bicycle", name: "Bicycle" },
  { id: "motorbike", name: "Motorbike" },
  { id: "scooter", name: "Scooter" },
  { id: "car", name: "Car" },
  { id: "pickup", name: "Pickup" },
  { id: "van", name: "Van" },
];

export const DRIVER_VEHICLE_TYPES: VehicleOption[] = [
  { id: "sedan", name: "Sedan" },
  { id: "hatchback", name: "Hatchback" },
  { id: "suv", name: "SUV" },
  { id: "pickup", name: "Pickup" },
  { id: "van", name: "Van" },
  { id: "minibus", name: "Minibus" },
];

export function findServiceArea(value?: string | null) {
  const clean = String(value || "").trim().toLowerCase();
  return ZIMBABWE_SERVICE_AREAS.find((area) => area.id === clean || area.name.toLowerCase() === clean || area.aliases?.some((alias) => alias.toLowerCase() === clean));
}
