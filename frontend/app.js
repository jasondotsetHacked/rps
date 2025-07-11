let provider, signer, contract, abi, contractAddress;
let currentGameId;

function moveName(m) {
  return ['None', 'Rock', 'Paper', 'Scissors'][m] || 'Unknown';
}

function statusName(s) {
  return ['Open', 'Committed', 'Revealed', 'Finished'][s] || 'Unknown';
}

function showSection(id) {
  document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
  const el = document.getElementById(id);
  if (el) el.style.display = '';
}

async function init() {
  const res = await fetch('RockPaperScissors.json');
  const json = await res.json();
  abi = json.abi;
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
    showSection('menu');
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
  const commit = ethers.keccak256(ethers.solidityPacked(['uint8', 'string'], [move, salt]));
  try {
    const tx = await contract.createGame(commit, { value: ethers.parseEther(wager) });
    const receipt = await tx.wait();
    const gameId = receipt.logs[0].args.gameId;
    document.getElementById('create-result').textContent = `Game ${gameId} created. Save this salt for reveal: ${salt}`;
    await showGame(gameId);
  } catch (err) {
    document.getElementById('create-result').textContent = err.message;
  }
}

async function loadGames(filter = 'all') {
  if (!contract) return;
  const count = Number(await contract.gameCount());
  const list = [];
  for (let i = 0; i < count; i++) {
    const g = await contract.games(i);
    if (Number(g.state) === 3) continue;
    const mine = signer && (signer.address === g.player1 || signer.address === g.player2);
    if (filter === 'open' && Number(g.state) !== 0) continue;
    if (filter === 'mine' && !mine) continue;
    list.push({ id: i, wager: ethers.formatEther(g.wager), state: Number(g.state) });
  }
  let html = '<table><tr><th>ID</th><th>Wager (ETH)</th><th>Status</th></tr>';
  list.forEach(g => {
    html += `<tr class="game-row" data-id="${g.id}"><td>${g.id}</td><td>${g.wager}</td><td>${statusName(g.state)}</td></tr>`;
  });
  html += '</table>';
  const container = document.getElementById('games-list');
  container.innerHTML = html;
  container.querySelectorAll('.game-row').forEach(row => {
    row.onclick = () => showGame(row.dataset.id);
  });
}

async function joinGame(id, move) {
  const salt = randomSalt();
  const commit = ethers.keccak256(ethers.solidityPacked(['uint8', 'string'], [move, salt]));
  try {
    const wager = await contract.games(id).then(g => g.wager);
    const tx = await contract.joinGame(id, commit, { value: wager });
    await tx.wait();
    document.getElementById('room-status').textContent = `Joined! Save salt: ${salt}`;
    await showGame(id);
  } catch (err) {
    document.getElementById('room-status').textContent = err.message;
  }
}

async function revealMove(id, move, salt) {
  try {
    const tx = await contract.reveal(id, move, salt);
    await tx.wait();
    document.getElementById('room-status').textContent = 'Revealed!';
    await showGame(id);
  } catch (err) {
    document.getElementById('room-status').textContent = err.message;
  }
}

function revealForm(num) {
  return `<label>Move:
    <select id="rev-move${num}">
      <option value="1">Rock</option>
      <option value="2">Paper</option>
      <option value="3">Scissors</option>
    </select>
  </label>
  <label>Salt: <input id="rev-salt${num}" type="text"></label>
  <button id="reveal-btn${num}">Reveal</button>`;
}

async function showGame(id) {
  if (!contract) return;
  currentGameId = Number(id);
  const g = await contract.games(id);

  document.getElementById('room-id').textContent = id;
  document.getElementById('room-status').textContent = statusName(Number(g.state));
  document.getElementById('player1-info').textContent = g.player1 + (Number(g.reveal1) ? ' - ' + moveName(Number(g.reveal1)) : '');
  document.getElementById('player2-info').textContent = (g.player2 === ethers.ZeroAddress ? 'Waiting for player 2' : g.player2) + (Number(g.reveal2) ? ' - ' + moveName(Number(g.reveal2)) : '');

  document.getElementById('player1-action').innerHTML = '';
  document.getElementById('player2-action').innerHTML = '';

  if (Number(g.state) === 0 && signer.address !== g.player1 && g.player2 === ethers.ZeroAddress) {
    document.getElementById('player2-action').innerHTML = `<label>Move:
      <select id="join-move">
        <option value="1">Rock</option>
        <option value="2">Paper</option>
        <option value="3">Scissors</option>
      </select>
    </label>
    <button id="join-btn">Join</button>`;
    document.getElementById('join-btn').onclick = () => joinGame(id, Number(document.getElementById('join-move').value));
  } else if (Number(g.state) === 1) {
    if (signer.address === g.player1 && Number(g.reveal1) === 0) {
      document.getElementById('player1-action').innerHTML = revealForm('1');
      document.getElementById('reveal-btn1').onclick = () => revealMove(id, Number(document.getElementById('rev-move1').value), document.getElementById('rev-salt1').value);
    }
    if (signer.address === g.player2 && Number(g.reveal2) === 0) {
      document.getElementById('player2-action').innerHTML = revealForm('2');
      document.getElementById('reveal-btn2').onclick = () => revealMove(id, Number(document.getElementById('rev-move2').value), document.getElementById('rev-salt2').value);
    }
  }

  showSection('game-room');
}

function setFilter(btnId, filter) {
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.getElementById(btnId).classList.add('active');
  loadGames(filter);
}

window.addEventListener('load', async () => {
  await init();
  document.getElementById('connect').onclick = connect;
  document.getElementById('btn-new-game').onclick = () => showSection('create-section');
  document.getElementById('btn-view-games').onclick = () => { showSection('games-page'); loadGames(); };
  document.getElementById('create-back').onclick = () => showSection('menu');
  document.getElementById('games-back').onclick = () => showSection('menu');
  document.getElementById('room-back').onclick = () => { showSection('games-page'); loadGames(); };
  document.getElementById('create').onclick = createGame;
  document.getElementById('filter-all').onclick = () => setFilter('filter-all', 'all');
  document.getElementById('filter-open').onclick = () => setFilter('filter-open', 'open');
  document.getElementById('filter-mine').onclick = () => setFilter('filter-mine', 'mine');
});
