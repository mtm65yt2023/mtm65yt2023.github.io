export interface BackendModel {
	gameCode: string;
	backendType: BackendType;
}

export interface PublicLobbyBackendModel extends BackendModel {
	backendType: BackendType.PublicLobby;
	region: PublicLobbyRegion;
}

export interface CustomServerBackendModel extends BackendModel {
	backendType: BackendType.CustomServer | BackendType.CustomServer;
	ip: string;
}

export enum BackendType {
	NoOp,
	PublicLobby,
	Impostor,
	CustomServer,
}

export enum PublicLobbyRegion {
	NorthAmerica = "NA",
	Europe = "EU",
	Asia = "AS",
}
