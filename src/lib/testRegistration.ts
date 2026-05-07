// Import all test components
import GradingTest from "@/components/soil/GradingTest";
import AtterbergTest from "@/components/soil/AtterbergTest";
import ProctorTest from "@/components/soil/ProctorTest";
import CBRTest from "@/components/soil/CBRTest";
import ShearTest from "@/components/soil/ShearTest";
import ConsolidationTest from "@/components/soil/ConsolidationTest";

import SlumpTest from "@/components/concrete/SlumpTest";
import CompressiveStrengthTest from "@/components/concrete/CompressiveStrengthTest";
import UPVTTest from "@/components/concrete/UPVTTest";
import SchmidtHammerTest from "@/components/concrete/SchmidtHammerTest";
import CoringTest from "@/components/concrete/CoringTest";
import ConcreteCubesTest from "@/components/concrete/ConcreteCubesTest";

import UCSTest from "@/components/rock/UCSTest";
import PointLoadTest from "@/components/rock/PointLoadTest";
import PorosityTest from "@/components/rock/PorosityTest";

import SPTTest from "@/components/special/SPTTest";
import DCPTest from "@/components/special/DCPTest";

import { registry } from "@/lib/testRegistry";

/**
 * Register all test components with their keys
 * This should be called once during app initialization
 */
export function registerAllTests(): void {
  // Soil tests
  registry.registerTest("grading", GradingTest);
  registry.registerTest("atterberg", AtterbergTest);
  registry.registerTest("proctor", ProctorTest);
  registry.registerTest("cbr", CBRTest);
  registry.registerTest("shear", ShearTest);
  registry.registerTest("consolidation", ConsolidationTest);

  // Concrete tests
  registry.registerTest("slump", SlumpTest);
  registry.registerTest("compressive", CompressiveStrengthTest);
  registry.registerTest("upvt", UPVTTest);
  registry.registerTest("schmidt", SchmidtHammerTest);
  registry.registerTest("coring", CoringTest);
  registry.registerTest("cubes", ConcreteCubesTest);

  // Rock tests
  registry.registerTest("ucs", UCSTest);
  registry.registerTest("pointload", PointLoadTest);
  registry.registerTest("porosity", PorosityTest);

  // Special tests
  registry.registerTest("spt", SPTTest);
  registry.registerTest("dcp", DCPTest);
}
