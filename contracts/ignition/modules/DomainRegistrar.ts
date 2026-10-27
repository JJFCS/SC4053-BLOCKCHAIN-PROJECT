import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Supply DomainRegistrarModule.treasuryAddress in an Ignition parameters file.
export default buildModule("DomainRegistrarModule", (m) => {
  const treasury = m.getParameter("treasuryAddress");
  const registrar = m.contract("DomainRegistrar", [treasury]);
  return { registrar };
});
