import type { PlannerPlayer, Roster } from '@/lib/planner/types';
import type { DatasetMetadata } from '@/lib/players/types';
export type SavedPlayer = {player_id: number;slot: string;player: PlannerPlayer};
export type DateAppearance = {player_id:number;game_id:string;team_name:string;team_abbreviation:string;opponent_name:string;opponent_abbreviation:string;is_home:boolean;points:number};
export type DashboardData = {roster:Roster;members:PlannerPlayer[];metadata:DatasetMetadata|null;date:string|null;saved:SavedPlayer[];appearances:DateAppearance[]};
