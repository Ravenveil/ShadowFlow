// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RunRegistry
 * @notice Maps ShadowFlow run IDs to their 0G Storage CIDs.
 *         Any holder of a run_id can independently verify the trajectory
 *         by looking up the CID on 0G Storage — no ShadowFlow server needed.
 *
 * @dev runId is keccak256(toUtf8Bytes(uuid_string)) — UUIDs are 36 chars
 *      and exceed the 31-byte limit of encodeBytes32String, so we hash them.
 *      evmVersion: cancun (required for 0G Chain Galileo testnet, chainId 16602)
 */
contract RunRegistry {
    struct RunRecord {
        string cid;
        address registrar;
        uint256 timestamp;
    }

    mapping(bytes32 => RunRecord) private _registry;

    event RunRegistered(bytes32 indexed runId, string cid, address registrar);

    /**
     * @notice Register a run_id → CID mapping.
     * @dev ACL: once registered, the mapping is immutable (first-write-wins).
     *      runId must be keccak256(toUtf8Bytes(uuid)) from ethers v6.
     */
    function register(bytes32 runId, string calldata cid) external {
        require(bytes(cid).length > 0, "RunRegistry: empty CID");
        require(
            _registry[runId].registrar == address(0),
            "RunRegistry: already registered"
        );
        _registry[runId] = RunRecord({
            cid: cid,
            registrar: msg.sender,
            timestamp: block.timestamp
        });
        emit RunRegistered(runId, cid, msg.sender);
    }

    /**
     * @notice Look up the CID and registrar for a run_id.
     * @return cid        The 0G Storage CID (empty string if not found).
     * @return registrar  The address that registered the run (zero if not found).
     * @return timestamp  Block timestamp when registered (0 if not found).
     */
    function lookup(bytes32 runId)
        external
        view
        returns (string memory cid, address registrar, uint256 timestamp)
    {
        RunRecord storage r = _registry[runId];
        return (r.cid, r.registrar, r.timestamp);
    }
}
