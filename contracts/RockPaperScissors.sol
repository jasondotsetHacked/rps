// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract RockPaperScissors {
    enum Move { None, Rock, Paper, Scissors }
    enum GameState { Open, Committed, Revealed, Finished }

    struct Game {
        address player1;
        address player2;
        uint256 wager;
        bytes32 commit1;
        bytes32 commit2;
        Move reveal1;
        Move reveal2;
        GameState state;
        uint256 createdAt;
        uint256 joinedAt;
    }

    uint256 public gameCount;
    mapping(uint256 => Game) public games;

    uint256 public constant JOIN_TIMEOUT = 1 days;
    uint256 public constant REVEAL_TIMEOUT = 1 days;

    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 wager);
    event GameJoined(uint256 indexed gameId, address indexed joiner);
    event MoveRevealed(uint256 indexed gameId, address indexed player, Move move);
    event GameCancelled(uint256 indexed gameId, address indexed cancelledBy);
    event GameSettled(uint256 indexed gameId, address winner, uint256 amount);

    // Player1 creates a game by committing hash(move + salt) and sending wager
    function createGame(bytes32 _commit) external payable returns (uint256 gameId) {
        require(_commit != bytes32(0), "Invalid commit");
        require(msg.value > 0, "Wager must be >0");

        gameId = gameCount++;
        Game storage g = games[gameId];
        g.player1 = msg.sender;
        g.wager = msg.value;
        g.commit1 = _commit;
        g.reveal1 = Move.None;
        g.reveal2 = Move.None;
        g.state = GameState.Open;
        g.createdAt = block.timestamp;

        emit GameCreated(gameId, msg.sender, msg.value);
    }

    // Player2 joins by matching wager and committing
    function joinGame(uint256 gameId, bytes32 _commit) external payable {
        require(gameId < gameCount, "No such game");
        require(_commit != bytes32(0), "Invalid commit");

        Game storage g = games[gameId];
        require(g.state == GameState.Open, "Not open");
        require(g.player2 == address(0), "Already joined");
        require(msg.value == g.wager, "Must match wager");

        g.player2 = msg.sender;
        g.commit2 = _commit;
        g.state = GameState.Committed;
        g.joinedAt = block.timestamp;

        emit GameJoined(gameId, msg.sender);
    }

    // Reveal move + salt
    function reveal(uint256 gameId, Move _move, string calldata _salt) external {
        require(gameId < gameCount, "No such game");
        require(_move != Move.None, "Must pick a move");

        Game storage g = games[gameId];
        require(g.state == GameState.Committed, "Wrong state");

        bytes32 computed = keccak256(abi.encodePacked(_move, _salt));
        if (msg.sender == g.player1) {
            require(g.reveal1 == Move.None, "Already revealed");
            require(g.commit1 == computed, "Bad reveal");
            g.reveal1 = _move;
        } else if (msg.sender == g.player2) {
            require(g.reveal2 == Move.None, "Already revealed");
            require(g.commit2 == computed, "Bad reveal");
            g.reveal2 = _move;
        } else {
            revert("Not in game");
        }

        emit MoveRevealed(gameId, msg.sender, _move);

        // Once both revealed, determine winner
        if (g.reveal1 != Move.None && g.reveal2 != Move.None) {
            g.state = GameState.Revealed;
            _settle(gameId);
        }
    }

    function _settle(uint256 gameId) internal {
        Game storage g = games[gameId];
        uint256 pot = g.wager * 2;
        address payable winner;

        if (g.reveal1 == g.reveal2) {
            // tie, refund both
            (bool sent1, ) = payable(g.player1).call{value: g.wager}("");
            require(sent1, "Refund failed");
            (bool sent2, ) = payable(g.player2).call{value: g.wager}("");
            require(sent2, "Refund failed");
            emit GameSettled(gameId, address(0), g.wager);
        } else if (
            (g.reveal1 == Move.Rock     && g.reveal2 == Move.Scissors) ||
            (g.reveal1 == Move.Paper    && g.reveal2 == Move.Rock)     ||
            (g.reveal1 == Move.Scissors && g.reveal2 == Move.Paper)
        ) {
            winner = payable(g.player1);
        } else {
            winner = payable(g.player2);
        }

        if (winner != address(0)) {
            (bool sent, ) = winner.call{value: pot}("");
            require(sent, "Payout failed");
            emit GameSettled(gameId, winner, pot);
        }

        g.state = GameState.Finished;
    }

    // Cancel a stuck game and refund
    function cancelGame(uint256 gameId) external {
        require(gameId < gameCount, "No such game");

        Game storage g = games[gameId];
        if (g.state == GameState.Open) {
            require(block.timestamp >= g.createdAt + JOIN_TIMEOUT, "Too early to cancel");
            (bool sent1, ) = payable(g.player1).call{value: g.wager}("");
            require(sent1, "Refund failed");
        } else if (g.state == GameState.Committed) {
            require(block.timestamp >= g.joinedAt + REVEAL_TIMEOUT, "Too early to cancel");
            // if one player revealed and the other didn't, the revealer wins the pot
            if (g.reveal1 != Move.None && g.reveal2 == Move.None) {
                (bool sent, ) = payable(g.player1).call{value: g.wager * 2}("");
                require(sent, "Payout failed");
                emit GameSettled(gameId, g.player1, g.wager * 2);
            } else if (g.reveal2 != Move.None && g.reveal1 == Move.None) {
                (bool sent, ) = payable(g.player2).call{value: g.wager * 2}("");
                require(sent, "Payout failed");
                emit GameSettled(gameId, g.player2, g.wager * 2);
            } else {
                (bool sent1, ) = payable(g.player1).call{value: g.wager}("");
                require(sent1, "Refund failed");
                (bool sent2, ) = payable(g.player2).call{value: g.wager}("");
                require(sent2, "Refund failed");
            }
        } else {
            revert("Cannot cancel");
        }

        g.state = GameState.Finished;
        emit GameCancelled(gameId, msg.sender);
    }
}
