let provider;
let signer;
let contract;
let abi;
let contractAddress;

async function init() {
  const res = await fetch('RockPaperScissors.json');
  const json = await res.json();
  abi = json.abi;
  // contractAddress will be filled after deployment script writes to deployed.json
  try {
    const addr = await (await fetch('deployed.json')).json();
    contractAddress = addr.address;
  } catch (err) {
    console.warn('Could not load deployed address.');
  }
}

async function connect() {
  if (!window.ethereum) {
    alert('No wallet found');
    return;
  }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  signer = await provider.getSigner();
  document.getElementById('account').textContent = 'Account: ' + signer.address;
  if (contractAddress) {
    contract = new ethers.Contract(contractAddress, abi, signer);
  }
}

function randomSalt() {
  return ethers.hexlify(ethers.randomBytes(32));
}

async function createGame() {
  if (!contract) return alert('Contract not connected');
  const move = Number(document.getElementById('create-move').value);
  const wager = document.getElementById('create-wager').value;
  const salt = randomSalt();
  const commit = ethers.keccak256(ethers.solidityPacked(['uint8','string'], [move, salt]));
  try {
    const tx = await contract.createGame(commit, { value: ethers.parseEther(wager) });
    const receipt = await tx.wait();
    const gameId = receipt.logs[0].args.gameId;
    document.getElementById('create-result').textContent = `Game ${gameId} created. Save this salt for reveal: ${salt}`;
  } catch (err) {
    document.getElementById('create-result').textContent = err.message;
  }
}

async function joinGame() {
  if (!contract) return alert('Contract not connected');
  const id = Number(document.getElementById('join-id').value);
  const move = Number(document.getElementById('join-move').value);
  const salt = randomSalt();
  const commit = ethers.keccak256(ethers.solidityPacked(['uint8','string'], [move, salt]));
  try {
    const wager = await contract.games(id).then(g => g.wager);
    const tx = await contract.joinGame(id, commit, { value: wager });
    await tx.wait();
    document.getElementById('join-result').textContent = `Joined game with salt: ${salt}`;
  } catch (err) {
    document.getElementById('join-result').textContent = err.message;
  }
}

async function reveal() {
  if (!contract) return alert('Contract not connected');
  const id = Number(document.getElementById('reveal-id').value);
  const move = Number(document.getElementById('reveal-move').value);
  const salt = document.getElementById('reveal-salt').value;
  try {
    const tx = await contract.reveal(id, move, salt);
    await tx.wait();
    document.getElementById('reveal-result').textContent = 'Revealed!';
  } catch (err) {
    document.getElementById('reveal-result').textContent = err.message;
  }
}

async function cancel() {
  if (!contract) return alert('Contract not connected');
  const id = Number(document.getElementById('cancel-id').value);
  try {
    const tx = await contract.cancelGame(id);
    await tx.wait();
    document.getElementById('cancel-result').textContent = 'Cancelled';
  } catch (err) {
    document.getElementById('cancel-result').textContent = err.message;
  }
}

window.addEventListener('load', async () => {
  await init();
  document.getElementById('connect').onclick = connect;
  document.getElementById('create').onclick = createGame;
  document.getElementById('join').onclick = joinGame;
  document.getElementById('reveal').onclick = reveal;
  document.getElementById('cancel').onclick = cancel;
});
