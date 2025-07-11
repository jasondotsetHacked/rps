const fs = require('fs');

async function main() {
  const RPS = await ethers.getContractFactory('RockPaperScissors');
  const rps = await RPS.deploy();
  await rps.waitForDeployment();
  const address = await rps.getAddress();
  console.log('RockPaperScissors deployed to:', address);
  fs.writeFileSync('frontend/deployed.json', JSON.stringify({ address }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
