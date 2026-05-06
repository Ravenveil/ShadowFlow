// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title TemplateRegistry
 * @notice Decentralized marketplace for ShadowFlow workflow templates.
 *         Creators publish templates stored on 0G Storage; buyers pay A0GI
 *         directly to creators — no platform fee, trustless.
 *
 * @dev evmVersion: cancun (required for 0G Chain Galileo, chainId 16602)
 *      templateId: keccak256(toUtf8Bytes(uuid)) from ethers v6
 */
contract TemplateRegistry {
    struct Template {
        string  cid;          // 0G Storage CID of the template YAML
        address creator;      // wallet that published
        uint256 price;        // price in wei (A0GI); 0 = free
        uint256 salesCount;   // total purchases
        bool    active;       // creator can delist
        string  title;        // display name
        string  description;  // short description (≤280 chars)
    }

    // templateId → Template
    mapping(bytes32 => Template) private _templates;

    // buyer → templateId → owned
    mapping(address => mapping(bytes32 => bool)) private _purchases;

    // creator → unclaimed earnings (wei)
    mapping(address => uint256) private _earnings;

    // ordered list of templateIds for browsing
    bytes32[] private _templateIds;

    // ── Events ───────────────────────────────────────────────────────────────

    event TemplatePublished(
        bytes32 indexed templateId,
        address indexed creator,
        string  cid,
        uint256 price,
        string  title
    );

    event TemplatePurchased(
        bytes32 indexed templateId,
        address indexed buyer,
        uint256 price
    );

    event TemplateDelisted(bytes32 indexed templateId);

    // ── Creator actions ──────────────────────────────────────────────────────

    /**
     * @notice Publish a new template.
     * @param templateId  keccak256(toUtf8Bytes(uuid)) — unique identifier
     * @param cid         0G Storage CID of the template YAML file
     * @param price       Price in wei (A0GI). Use 0 for free templates.
     * @param title       Display name shown in the marketplace
     * @param description Short description (≤280 chars)
     */
    function publish(
        bytes32 templateId,
        string calldata cid,
        uint256 price,
        string calldata title,
        string calldata description
    ) external {
        require(bytes(cid).length > 0, "TemplateRegistry: empty CID");
        require(bytes(title).length > 0, "TemplateRegistry: empty title");
        require(
            _templates[templateId].creator == address(0),
            "TemplateRegistry: templateId already registered"
        );

        _templates[templateId] = Template({
            cid:         cid,
            creator:     msg.sender,
            price:       price,
            salesCount:  0,
            active:      true,
            title:       title,
            description: description
        });
        _templateIds.push(templateId);

        emit TemplatePublished(templateId, msg.sender, cid, price, title);
    }

    /**
     * @notice Delist a template (only creator). Buyers who already purchased
     *         retain access; new purchases blocked.
     */
    function delist(bytes32 templateId) external {
        require(
            _templates[templateId].creator == msg.sender,
            "TemplateRegistry: not creator"
        );
        _templates[templateId].active = false;
        emit TemplateDelisted(templateId);
    }

    /**
     * @notice Withdraw accumulated earnings to creator's wallet.
     */
    function withdraw() external {
        uint256 amount = _earnings[msg.sender];
        require(amount > 0, "TemplateRegistry: nothing to withdraw");
        _earnings[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "TemplateRegistry: transfer failed");
    }

    // ── Buyer actions ────────────────────────────────────────────────────────

    /**
     * @notice Purchase a template. Send exact A0GI price as msg.value.
     *         Payment is held until creator withdraws.
     *         Free templates (price=0) can be claimed without sending value.
     */
    function purchase(bytes32 templateId) external payable {
        Template storage t = _templates[templateId];
        require(t.creator != address(0), "TemplateRegistry: template not found");
        require(t.active, "TemplateRegistry: template delisted");
        require(
            !_purchases[msg.sender][templateId],
            "TemplateRegistry: already owned"
        );
        require(msg.value == t.price, "TemplateRegistry: wrong price");

        _purchases[msg.sender][templateId] = true;
        t.salesCount += 1;
        _earnings[t.creator] += msg.value;

        emit TemplatePurchased(templateId, msg.sender, msg.value);
    }

    // ── Read-only (free, no wallet needed) ──────────────────────────────────

    function lookup(bytes32 templateId)
        external
        view
        returns (Template memory)
    {
        return _templates[templateId];
    }

    function isOwned(address buyer, bytes32 templateId)
        external
        view
        returns (bool)
    {
        Template storage t = _templates[templateId];
        // creator always owns their own template; free templates are auto-owned
        if (t.creator == buyer || t.price == 0) return true;
        return _purchases[buyer][templateId];
    }

    function totalTemplates() external view returns (uint256) {
        return _templateIds.length;
    }

    /**
     * @notice Paginated template list for the marketplace browse page.
     * @param offset  Start index
     * @param limit   Max items to return (capped at 50)
     */
    function listTemplates(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory ids, Template[] memory templates)
    {
        uint256 total = _templateIds.length;
        if (offset >= total) return (new bytes32[](0), new Template[](0));

        uint256 cap = limit > 50 ? 50 : limit;
        uint256 end = offset + cap;
        if (end > total) end = total;
        uint256 count = end - offset;

        ids = new bytes32[](count);
        templates = new Template[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = _templateIds[offset + i];
            templates[i] = _templates[ids[i]];
        }
    }

    function pendingEarnings(address creator) external view returns (uint256) {
        return _earnings[creator];
    }
}
