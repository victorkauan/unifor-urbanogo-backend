import { fileURLToPath } from "node:url";
import { PrismaClient, type ServicePreference } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_PASSWORD_HASH = "dev-seed-password-hash";
const FORTALEZA = { lat: -3.7319, lng: -38.5267 };
const KM_PER_DEGREE_LAT = 111.045;

interface PassengerSeed {
  name: string;
  email: string;
  phone: string;
}

interface DriverSeed {
  name: string;
  email: string;
  phone: string;
  servicePreference: ServicePreference;
  isOnline: boolean;
  vehicleModel: string;
  vehiclePlate: string;
  eastKm: number;
  northKm: number;
  trustScore: number;
}

const passengers: PassengerSeed[] = [
  { name: "John Doe", email: "john.doe@example.com", phone: "+5585999990001" },
  { name: "Jane Smith", email: "jane.smith@example.com", phone: "+5585999990002" },
  { name: "Michael Brown", email: "michael.brown@example.com", phone: "+5585999990003" },
  { name: "Emily Davis", email: "emily.davis@example.com", phone: "+5585999990004" },
  { name: "David Wilson", email: "david.wilson@example.com", phone: "+5585999990005" },
  { name: "Sarah Johnson", email: "sarah.johnson@example.com", phone: "+5585999990006" },
];

const drivers: DriverSeed[] = [
  {
    name: "Jane Doe",
    email: "jane.doe@example.com",
    phone: "+5585988880001",
    servicePreference: "both",
    isOnline: true,
    vehicleModel: "Chevrolet Onix",
    vehiclePlate: "ABC1D23",
    eastKm: 1.2,
    northKm: -0.8,
    trustScore: 0.94,
  },
  {
    name: "Carlos Souza",
    email: "carlos.souza@example.com",
    phone: "+5585988880002",
    servicePreference: "rides",
    isOnline: true,
    vehicleModel: "Hyundai HB20",
    vehiclePlate: "DEF2G45",
    eastKm: -2.1,
    northKm: 1.5,
    trustScore: 0.88,
  },
  {
    name: "Mariana Lima",
    email: "mariana.lima@example.com",
    phone: "+5585988880003",
    servicePreference: "deliveries",
    isOnline: true,
    vehicleModel: "Honda CG 160",
    vehiclePlate: "GHI3J67",
    eastKm: 0.6,
    northKm: 2.3,
    trustScore: 0.91,
  },
  {
    name: "Pedro Alves",
    email: "pedro.alves@example.com",
    phone: "+5585988880004",
    servicePreference: "both",
    isOnline: true,
    vehicleModel: "Toyota Corolla",
    vehiclePlate: "JKL4M89",
    eastKm: -1.4,
    northKm: -2,
    trustScore: 0.79,
  },
  {
    name: "Ana Costa",
    email: "ana.costa@example.com",
    phone: "+5585988880005",
    servicePreference: "rides",
    isOnline: false,
    vehicleModel: "Renault Kwid",
    vehiclePlate: "MNO5P12",
    eastKm: 3.1,
    northKm: 0.4,
    trustScore: 0.85,
  },
  {
    name: "Lucas Rocha",
    email: "lucas.rocha@example.com",
    phone: "+5585988880006",
    servicePreference: "deliveries",
    isOnline: true,
    vehicleModel: "Yamaha Factor",
    vehiclePlate: "PQR6S34",
    eastKm: -0.9,
    northKm: -3.2,
    trustScore: 0.67,
  },
  {
    name: "Beatriz Nunes",
    email: "beatriz.nunes@example.com",
    phone: "+5585988880007",
    servicePreference: "both",
    isOnline: true,
    vehicleModel: "Fiat Argo",
    vehiclePlate: "STU7V56",
    eastKm: 2.4,
    northKm: -1.7,
    trustScore: 0.9,
  },
  {
    name: "Rafael Dias",
    email: "rafael.dias@example.com",
    phone: "+5585988880008",
    servicePreference: "rides",
    isOnline: true,
    vehicleModel: "Volkswagen Gol",
    vehiclePlate: "VWX8Y78",
    eastKm: -3,
    northKm: -0.6,
    trustScore: 0.82,
  },
  {
    name: "Camila Ferreira",
    email: "camila.ferreira@example.com",
    phone: "+5585988880009",
    servicePreference: "both",
    isOnline: false,
    vehicleModel: "Jeep Renegade",
    vehiclePlate: "YZA9B01",
    eastKm: 0.2,
    northKm: 4.1,
    trustScore: 0.76,
  },
  {
    name: "Thiago Martins",
    email: "thiago.martins@example.com",
    phone: "+5585988880010",
    servicePreference: "deliveries",
    isOnline: true,
    vehicleModel: "Honda Biz",
    vehiclePlate: "BCD0E23",
    eastKm: 1.8,
    northKm: 3,
    trustScore: 0.7,
  },
];

function spreadPosition(eastKm: number, northKm: number): { lat: number; lng: number } {
  const lat = FORTALEZA.lat + northKm / KM_PER_DEGREE_LAT;
  const lng =
    FORTALEZA.lng + eastKm / (KM_PER_DEGREE_LAT * Math.cos((FORTALEZA.lat * Math.PI) / 180));
  return { lat, lng };
}

export async function seed(client: PrismaClient = prisma): Promise<void> {
  const now = new Date();

  for (const passenger of passengers) {
    await client.user.upsert({
      where: { email: passenger.email },
      update: { name: passenger.name, phone: passenger.phone },
      create: {
        name: passenger.name,
        email: passenger.email,
        phone: passenger.phone,
        passwordHash: SEED_PASSWORD_HASH,
        role: "passenger",
      },
    });
  }

  for (const driverSeed of drivers) {
    const user = await client.user.upsert({
      where: { email: driverSeed.email },
      update: { name: driverSeed.name, phone: driverSeed.phone },
      create: {
        name: driverSeed.name,
        email: driverSeed.email,
        phone: driverSeed.phone,
        passwordHash: SEED_PASSWORD_HASH,
        role: "driver",
      },
    });

    const driver = await client.driver.upsert({
      where: { userId: user.id },
      update: {
        servicePreference: driverSeed.servicePreference,
        isOnline: driverSeed.isOnline,
        vehicleModel: driverSeed.vehicleModel,
        vehiclePlate: driverSeed.vehiclePlate,
      },
      create: {
        userId: user.id,
        servicePreference: driverSeed.servicePreference,
        isOnline: driverSeed.isOnline,
        vehicleModel: driverSeed.vehicleModel,
        vehiclePlate: driverSeed.vehiclePlate,
      },
    });

    const position = spreadPosition(driverSeed.eastKm, driverSeed.northKm);
    await client.driverLocation.upsert({
      where: { driverId: driver.id },
      update: { lat: position.lat, lng: position.lng, recordedAt: now },
      create: { driverId: driver.id, lat: position.lat, lng: position.lng, recordedAt: now },
    });

    await client.trustScore.upsert({
      where: { userId: user.id },
      update: { score: driverSeed.trustScore, source: "stub", computedAt: now },
      create: { userId: user.id, score: driverSeed.trustScore, source: "stub", computedAt: now },
    });
  }
}

async function runCli(): Promise<void> {
  try {
    await seed();
    const [users, driverCount, locations, onlineDrivers] = await Promise.all([
      prisma.user.count(),
      prisma.driver.count(),
      prisma.driverLocation.count(),
      prisma.driver.count({ where: { isOnline: true } }),
    ]);
    console.log(
      `seed complete: ${users} users, ${driverCount} drivers (${onlineDrivers} online), ${locations} locations`,
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void runCli();
}
