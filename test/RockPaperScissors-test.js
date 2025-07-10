const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("RockPaperScissors", function () {
  let RPS, rps;
  let owner, p1, p2, p3;
  const wager = ethers.utils.parseEther("1");
  const salt1 = "abc123";
  const salt2 = "xyz789";

  function commitHash(move, salt) {
    return ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["uint8", "string"], [move, salt])
    );
  }

  beforeEach(async () => {
    [owner, p1, p2, p3] = await ethers.getSigners();
    RPS = await ethers.getContractFactory("RockPaperScissors");
    rps = await RPS.deploy();
    await rps.deployed();
  });

  it("should let player1 create and emit event", async () => {
    const commit1 = commitHash(1, salt1);
    await expect(
      rps.connect(p1).createGame(commit1, { value: wager })
    )
      .to.emit(rps, "GameCreated")
      .withArgs(0, p1.address, wager);

    const game = await rps.games(0);
    expect(game.player1).to.equal(p1.address);
    expect(game.wager).to.equal(wager);
    expect(game.state).to.equal(0); // Open
  });

  it("should let player2 join and emit event", async () => {
    const commit1 = commitHash(2, salt1);
    await rps.connect(p1).createGame(commit1, { value: wager });

    const commit2 = commitHash(3, salt2);
    await expect(
      rps.connect(p2).joinGame(0, commit2, { value: wager })
    )
      .to.emit(rps, "GameJoined")
      .withArgs(0, p2.address);

    const game = await rps.games(0);
    expect(game.player2).to.equal(p2.address);
    expect(game.state).to.equal(1); // Committed
  });

  it("should play a full game and pay winner", async () => {
    // p1 creates
    const commit1 = commitHash(1, salt1); // Rock
    await rps.connect(p1).createGame(commit1, { value: wager });

    // p2 joins
    const commit2 = commitHash(3, salt2); // Scissors
    await rps.connect(p2).joinGame(0, commit2, { value: wager });

    // track balances
    const bal1Before = await ethers.provider.getBalance(p1.address);

    // reveal moves
    await expect(rps.connect(p1).reveal(0, 1, salt1))
      .to.emit(rps, "MoveRevealed").withArgs(0, p1.address, 1);
    await expect(rps.connect(p2).reveal(0, 3, salt2))
      .to.emit(rps, "MoveRevealed").withArgs(0, p2.address, 3)
      .and.to.emit(rps, "GameSettled").withArgs(0, p1.address, wager.mul(2));

    const bal1After = await ethers.provider.getBalance(p1.address);
    expect(bal1After).to.be.gt(bal1Before);

    const game = await rps.games(0);
    expect(game.state).to.equal(3); // Finished
  });

  it("should split wager on tie", async () => {
    const commit1 = commitHash(2, salt1); // Paper
    await rps.connect(p1).createGame(commit1, { value: wager });
    const commit2 = commitHash(2, salt2);
    await rps.connect(p2).joinGame(0, commit2, { value: wager });

    const bal1Before = await ethers.provider.getBalance(p1.address);
    const bal2Before = await ethers.provider.getBalance(p2.address);

    await rps.connect(p1).reveal(0, 2, salt1);
    await expect(rps.connect(p2).reveal(0, 2, salt2))
      .to.emit(rps, "GameSettled").withArgs(0, ethers.constants.AddressZero, wager);

    const bal1After = await ethers.provider.getBalance(p1.address);
    const bal2After = await ethers.provider.getBalance(p2.address);
    expect(bal1After).to.be.gt(bal1Before);
    expect(bal2After).to.be.gt(bal2Before);

    const game = await rps.games(0);
    expect(game.state).to.equal(3);
  });

  it("should cancel open game after timeout", async () => {
    const commit1 = commitHash(1, salt1);
    await rps.connect(p1).createGame(commit1, { value: wager });

    // fast-forward 1 day + 1s
    await network.provider.send("evm_increaseTime", [86400 + 1]);
    await network.provider.send("evm_mine");

    await expect(
      rps.connect(p1).cancelGame(0)
    )
      .to.emit(rps, "GameCancelled").withArgs(0, p1.address);

    const game = await rps.games(0);
    expect(game.state).to.equal(3);
  });

  it("should cancel committed game after reveal timeout and refund both", async () => {
    const commit1 = commitHash(1, salt1);
    await rps.connect(p1).createGame(commit1, { value: wager });
    const commit2 = commitHash(3, salt2);
    await rps.connect(p2).joinGame(0, commit2, { value: wager });

    // fast-forward 1 day + 1s
    await network.provider.send("evm_increaseTime", [86400 + 1]);
    await network.provider.send("evm_mine");

    await expect(
      rps.connect(p2).cancelGame(0)
    )
      .to.emit(rps, "GameCancelled").withArgs(0, p2.address);

    const game = await rps.games(0);
    expect(game.state).to.equal(3);
  });

  it("should revert on invalid reveals or joins", async () => {
    // non-existent game
    await expect(rps.connect(p1).joinGame(5, "0x00", { value: wager }))
      .to.be.revertedWith("No such game");

    const commit1 = commitHash(1, salt1);
    await rps.connect(p1).createGame(commit1, { value: wager });

    // duplicate join
    const commit2 = commitHash(2, salt2);
    await rps.connect(p2).joinGame(0, commit2, { value: wager });
    await expect(
      rps.connect(p3).joinGame(0, commitHash(3, "zzz"), { value: wager })
    ).to.be.reverted;

    // reveal without join
    await expect(
      rps.connect(p3).reveal(0, 1, "nope")
    ).to.be.revertedWith("Not in game");
  });
});
