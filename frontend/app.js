let provider;
let signer;
let contract;
let abi;
let contractAddress;

function formatTimeLeft(seconds) {
  if (seconds <= 0) return 'Expired';
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

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
      await loadGames();
    }
}

function randomSalt() {
  return ethers.hexlify(ethers.randomBytes(32));
}

async function loadGames() {
  if (!contract) return;
  const count = Number(await contract.gameCount());
  const joinTimeout = Number(await contract.JOIN_TIMEOUT());
  const revealTimeout = Number(await contract.REVEAL_TIMEOUT());
  const now = Math.floor(Date.now() / 1000);
  let active = '<table><tr><th>ID</th><th>Wager (ETH)</th><th>Time Left</th></tr>';
  let completed = '<table><tr><th>ID</th><th>Wager (ETH)</th></tr>';
  for (let i = 0; i < count; i++) {
    const g = await contract.games(i);
    const wager = ethers.formatEther(g.wager);
    const state = Number(g.state);
    if (state === 3) {
      completed += `<tr><td>${i}</td><td>${wager}</td></tr>`;
    } else {
      let timeLeft = '';
      if (state === 0) {
        const left = Number(g.createdAt) + joinTimeout - now;
        timeLeft = formatTimeLeft(left);
      } else if (state === 1) {
        const left = Number(g.joinedAt) + revealTimeout - now;
        timeLeft = formatTimeLeft(left);
      }
      active += `<tr><td>${i}</td><td>${wager}</td><td>${timeLeft}</td></tr>`;
    }
  }
  active += '</table>';
  completed += '</table>';
  document.getElementById('active-games').innerHTML = active;
  document.getElementById('completed-games').innerHTML = completed;
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
    await loadGames();
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
    await loadGames();
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
    await loadGames();
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
    await loadGames();
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
  document.getElementById('tab-active').onclick = () => {
    document.getElementById('tab-active').classList.add('active');
    document.getElementById('tab-completed').classList.remove('active');
    document.getElementById('active-games').style.display = '';
    document.getElementById('completed-games').style.display = 'none';
  };
  document.getElementById('tab-completed').onclick = () => {
    document.getElementById('tab-completed').classList.add('active');
    document.getElementById('tab-active').classList.remove('active');
    document.getElementById('active-games').style.display = 'none';
    document.getElementById('completed-games').style.display = '';
  };
});
