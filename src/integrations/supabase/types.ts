export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_config: {
        Row: {
          id: number;
          sharepoint_drive_id: string | null;
          sharepoint_folder_path: string | null;
          sharepoint_site_id: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          sharepoint_drive_id?: string | null;
          sharepoint_folder_path?: string | null;
          sharepoint_site_id?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: number;
          sharepoint_drive_id?: string | null;
          sharepoint_folder_path?: string | null;
          sharepoint_site_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      document_versions: {
        Row: {
          author_id: string;
          comment: string | null;
          content_hash: string | null;
          content_snapshot: string | null;
          created_at: string;
          document_id: string;
          id: string;
          sharepoint_version_label: string | null;
          version_number: number;
        };
        Insert: {
          author_id: string;
          comment?: string | null;
          content_hash?: string | null;
          content_snapshot?: string | null;
          created_at?: string;
          document_id: string;
          id?: string;
          sharepoint_version_label?: string | null;
          version_number: number;
        };
        Update: {
          author_id?: string;
          comment?: string | null;
          content_hash?: string | null;
          content_snapshot?: string | null;
          created_at?: string;
          document_id?: string;
          id?: string;
          sharepoint_version_label?: string | null;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          content_inline: string | null;
          created_at: string;
          current_version: number;
          description: string | null;
          id: string;
          module: string;
          name: string;
          organization_id: string;
          owner_id: string;
          primary_process_id: string | null;
          primary_process_version: number | null;
          sharepoint_drive_id: string | null;
          sharepoint_item_id: string | null;
          sharepoint_web_url: string | null;
          updated_at: string;
        };
        Insert: {
          content_inline?: string | null;
          created_at?: string;
          current_version?: number;
          description?: string | null;
          id?: string;
          module?: string;
          name: string;
          organization_id: string;
          owner_id: string;
          primary_process_id?: string | null;
          primary_process_version?: number | null;
          sharepoint_drive_id?: string | null;
          sharepoint_item_id?: string | null;
          sharepoint_web_url?: string | null;
          updated_at?: string;
        };
        Update: {
          content_inline?: string | null;
          created_at?: string;
          current_version?: number;
          description?: string | null;
          id?: string;
          module?: string;
          name?: string;
          organization_id?: string;
          owner_id?: string;
          primary_process_id?: string | null;
          primary_process_version?: number | null;
          sharepoint_drive_id?: string | null;
          sharepoint_item_id?: string | null;
          sharepoint_web_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          category: string;
          code_settings: Json;
          created_at: string;
          created_by: string | null;
          id: string;
          logo_data_url: string | null;
          name: string;
          slug: string;
          updated_at: string;
          word_header_color: string;
        };
        Insert: {
          category?: string;
          code_settings?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          logo_data_url?: string | null;
          name: string;
          slug: string;
          updated_at?: string;
          word_header_color?: string;
        };
        Update: {
          category?: string;
          code_settings?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          logo_data_url?: string | null;
          name?: string;
          slug?: string;
          updated_at?: string;
          word_header_color?: string;
        };
        Relationships: [];
      };
      organization_document_models: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          logo_data_url: string | null;
          model_key: string;
          name: string;
          organization_id: string;
          primary_color: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          logo_data_url?: string | null;
          model_key: string;
          name: string;
          organization_id: string;
          primary_color?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          logo_data_url?: string | null;
          model_key?: string;
          name?: string;
          organization_id?: string;
          primary_color?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_document_models_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_departments: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          organization_id: string;
          sigla: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          sigla?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          sigla?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_departments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_units: {
        Row: {
          active: boolean;
          code: string | null;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_units_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_value_chains: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_value_chains_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_process_types: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          id: string;
          label: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          id?: string;
          label: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          id?: string;
          label?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_process_types_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_process_owners: {
        Row: {
          created_at: string;
          created_by: string | null;
          department_id: string | null;
          id: string;
          name: string;
          organization_id: string;
          role_title: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          department_id?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          role_title?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          department_id?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          role_title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_process_owners_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "organization_departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_process_owners_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_causes: {
        Row: {
          action: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          impact: string | null;
          organization_id: string;
          priority: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          action?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          impact?: string | null;
          organization_id: string;
          priority?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          action?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          impact?: string | null;
          organization_id?: string;
          priority?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_causes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_processes: {
        Row: {
          code: string | null;
          created_at: string;
          created_by: string | null;
          current_version: number;
          department: string | null;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          owner: string | null;
          parent_process_id: string | null;
          status: string;
          type: string;
          updated_at: string;
          value_chain_id: string | null;
        };
        Insert: {
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version?: number;
          department?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          owner?: string | null;
          parent_process_id?: string | null;
          status?: string;
          type?: string;
          updated_at?: string;
          value_chain_id?: string | null;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version?: number;
          department?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          owner?: string | null;
          parent_process_id?: string | null;
          status?: string;
          type?: string;
          updated_at?: string;
          value_chain_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_processes_value_chain_id_fkey";
            columns: ["value_chain_id"];
            isOneToOne: false;
            referencedRelation: "organization_value_chains";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_processes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_processes_parent_process_id_fkey";
            columns: ["parent_process_id"];
            isOneToOne: false;
            referencedRelation: "organization_processes";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_process_versions: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
          process_id: string;
          snapshot: Json;
          version_number: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
          process_id: string;
          snapshot?: Json;
          version_number: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          process_id?: string;
          snapshot?: Json;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "organization_process_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_process_versions_process_id_fkey";
            columns: ["process_id"];
            isOneToOne: false;
            referencedRelation: "organization_processes";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_organization_access: {
        Row: {
          created_at: string;
          is_default: boolean;
          organization_id: string;
          unit_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          is_default?: boolean;
          organization_id: string;
          unit_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          is_default?: boolean;
          organization_id?: string;
          unit_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_organization_access_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_organization_access_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "organization_units";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_user_organization_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_maestro: {
        Args: {
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "maestro" | "admin" | "editor" | "viewer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["maestro", "admin", "editor", "viewer"],
    },
  },
} as const;
