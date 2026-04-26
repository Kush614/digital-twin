// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PersonaNFT — ownable AI persona with on-chain royalty splits
/// @notice Self-contained ERC-721 written for the 2026 BETA Hackathon. Each token
/// represents a forged persona; ETH sent to `tip(tokenId)` is split among the
/// persona's contributors according to basis-point shares set at mint time.
contract PersonaNFT {
    string public name = "PersonaForge";
    string public symbol = "FORGE";

    uint256 public totalSupply;

    struct Contributor { address payable wallet; uint96 shareBps; }

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _approvals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(uint256 => string) public tokenURIById;
    mapping(uint256 => string) public personaSlug;
    mapping(uint256 => string) public constitutionHash;
    mapping(uint256 => Contributor[]) private _contributors;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event PersonaMinted(uint256 indexed tokenId, address indexed owner, string slug, string uri);
    event Tip(uint256 indexed tokenId, address indexed from, uint256 amount);
    event RoyaltyPaid(uint256 indexed tokenId, address indexed to, uint256 amount);

    error NotOwner();
    error InvalidShare();
    error NoContributors();
    error TipFailed();

    function balanceOf(address owner) external view returns (uint256) { return _balances[owner]; }
    function ownerOf(uint256 tokenId) public view returns (address o) {
        o = _owners[tokenId];
        require(o != address(0), "nonexistent");
    }
    function tokenURI(uint256 tokenId) external view returns (string memory) { return tokenURIById[tokenId]; }
    function contributorsOf(uint256 tokenId) external view returns (Contributor[] memory) { return _contributors[tokenId]; }

    function mint(
        address to,
        string calldata uri,
        string calldata slug,
        string calldata constHash,
        Contributor[] calldata contribs
    ) external returns (uint256 tokenId) {
        uint256 total;
        for (uint256 i = 0; i < contribs.length; i++) {
            require(contribs[i].wallet != address(0), "zero contrib");
            total += contribs[i].shareBps;
        }
        if (contribs.length > 0 && total != 10_000) revert InvalidShare();

        tokenId = ++totalSupply;
        _owners[tokenId] = to;
        _balances[to] += 1;
        tokenURIById[tokenId] = uri;
        personaSlug[tokenId] = slug;
        constitutionHash[tokenId] = constHash;
        for (uint256 i = 0; i < contribs.length; i++) {
            _contributors[tokenId].push(contribs[i]);
        }
        emit Transfer(address(0), to, tokenId);
        emit PersonaMinted(tokenId, to, slug, uri);
    }

    function tip(uint256 tokenId) external payable {
        require(_owners[tokenId] != address(0), "nonexistent");
        emit Tip(tokenId, msg.sender, msg.value);
        Contributor[] storage list = _contributors[tokenId];
        if (list.length == 0) {
            address payable owner = payable(_owners[tokenId]);
            (bool ok,) = owner.call{value: msg.value}("");
            if (!ok) revert TipFailed();
            emit RoyaltyPaid(tokenId, owner, msg.value);
            return;
        }
        uint256 sent;
        for (uint256 i = 0; i < list.length; i++) {
            uint256 share = i == list.length - 1 ? msg.value - sent : (msg.value * list[i].shareBps) / 10_000;
            sent += share;
            (bool ok,) = list[i].wallet.call{value: share}("");
            if (!ok) revert TipFailed();
            emit RoyaltyPaid(tokenId, list[i].wallet, share);
        }
    }

    function approve(address to, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        require(owner == msg.sender || _operatorApprovals[owner][msg.sender], "not authorized");
        _approvals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) { return _approvals[tokenId]; }
    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }
    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(ownerOf(tokenId) == from, "wrong from");
        require(
            msg.sender == from ||
            _approvals[tokenId] == msg.sender ||
            _operatorApprovals[from][msg.sender],
            "not authorized"
        );
        _approvals[tokenId] = address(0);
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external { transferFrom(from, to, tokenId); }
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external { transferFrom(from, to, tokenId); }

    function supportsInterface(bytes4 iid) external pure returns (bool) {
        return iid == 0x01ffc9a7 /* ERC165 */ || iid == 0x80ac58cd /* ERC721 */ || iid == 0x5b5e139f /* metadata */;
    }
}
