import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { ActiveSessionsResponse, AdminListResponse, AdminLoginRequest, AdminLoginResponse, AdminRecord, AdminSessionsResponse, ComputerStatusResponse, CreateAdminBody, ErrorResponse, GetAllSessionsParams, GetStatsParams, HealthStatus, HeartbeatResponse, ListStudentsParams, LoginRequest, LogoutRequest, LogoutResponse, LookupStudentParams, SessionResponse, StatsResponse, StudentBody, StudentListResponse, StudentLookupResponse, StudentRecord, SuccessResponse, UpdateAdminBody } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Lookup student by ID
 */
export declare const getLookupStudentUrl: (params: LookupStudentParams) => string;
export declare const lookupStudent: (params: LookupStudentParams, options?: RequestInit) => Promise<StudentLookupResponse>;
export declare const getLookupStudentQueryKey: (params?: LookupStudentParams) => readonly ["/api/sessions/lookup", ...LookupStudentParams[]];
export declare const getLookupStudentQueryOptions: <TData = Awaited<ReturnType<typeof lookupStudent>>, TError = ErrorType<ErrorResponse>>(params: LookupStudentParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof lookupStudent>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof lookupStudent>>, TError, TData> & {
    queryKey: QueryKey;
};
export type LookupStudentQueryResult = NonNullable<Awaited<ReturnType<typeof lookupStudent>>>;
export type LookupStudentQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Lookup student by ID
 */
export declare function useLookupStudent<TData = Awaited<ReturnType<typeof lookupStudent>>, TError = ErrorType<ErrorResponse>>(params: LookupStudentParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof lookupStudent>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Student login
 */
export declare const getStudentLoginUrl: () => string;
export declare const studentLogin: (loginRequest: LoginRequest, options?: RequestInit) => Promise<SessionResponse>;
export declare const getStudentLoginMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof studentLogin>>, TError, {
        data: BodyType<LoginRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof studentLogin>>, TError, {
    data: BodyType<LoginRequest>;
}, TContext>;
export type StudentLoginMutationResult = NonNullable<Awaited<ReturnType<typeof studentLogin>>>;
export type StudentLoginMutationBody = BodyType<LoginRequest>;
export type StudentLoginMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Student login
 */
export declare const useStudentLogin: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof studentLogin>>, TError, {
        data: BodyType<LoginRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof studentLogin>>, TError, {
    data: BodyType<LoginRequest>;
}, TContext>;
/**
 * @summary Student logout
 */
export declare const getStudentLogoutUrl: () => string;
export declare const studentLogout: (logoutRequest: LogoutRequest, options?: RequestInit) => Promise<LogoutResponse>;
export declare const getStudentLogoutMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof studentLogout>>, TError, {
        data: BodyType<LogoutRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof studentLogout>>, TError, {
    data: BodyType<LogoutRequest>;
}, TContext>;
export type StudentLogoutMutationResult = NonNullable<Awaited<ReturnType<typeof studentLogout>>>;
export type StudentLogoutMutationBody = BodyType<LogoutRequest>;
export type StudentLogoutMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Student logout
 */
export declare const useStudentLogout: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof studentLogout>>, TError, {
        data: BodyType<LogoutRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof studentLogout>>, TError, {
    data: BodyType<LogoutRequest>;
}, TContext>;
/**
 * @summary Get active sessions
 */
export declare const getGetActiveSessionsUrl: () => string;
export declare const getActiveSessions: (options?: RequestInit) => Promise<ActiveSessionsResponse>;
export declare const getGetActiveSessionsQueryKey: () => readonly ["/api/sessions/active"];
export declare const getGetActiveSessionsQueryOptions: <TData = Awaited<ReturnType<typeof getActiveSessions>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getActiveSessions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getActiveSessions>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetActiveSessionsQueryResult = NonNullable<Awaited<ReturnType<typeof getActiveSessions>>>;
export type GetActiveSessionsQueryError = ErrorType<unknown>;
/**
 * @summary Get active sessions
 */
export declare function useGetActiveSessions<TData = Awaited<ReturnType<typeof getActiveSessions>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getActiveSessions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Session heartbeat
 */
export declare const getSessionHeartbeatUrl: (sessionId: number) => string;
export declare const sessionHeartbeat: (sessionId: number, options?: RequestInit) => Promise<HeartbeatResponse>;
export declare const getSessionHeartbeatMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof sessionHeartbeat>>, TError, {
        sessionId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof sessionHeartbeat>>, TError, {
    sessionId: number;
}, TContext>;
export type SessionHeartbeatMutationResult = NonNullable<Awaited<ReturnType<typeof sessionHeartbeat>>>;
export type SessionHeartbeatMutationError = ErrorType<unknown>;
/**
 * @summary Session heartbeat
 */
export declare const useSessionHeartbeat: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof sessionHeartbeat>>, TError, {
        sessionId: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof sessionHeartbeat>>, TError, {
    sessionId: number;
}, TContext>;
/**
 * @summary Admin login
 */
export declare const getAdminLoginUrl: () => string;
export declare const adminLogin: (adminLoginRequest: AdminLoginRequest, options?: RequestInit) => Promise<AdminLoginResponse>;
export declare const getAdminLoginMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof adminLogin>>, TError, {
        data: BodyType<AdminLoginRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof adminLogin>>, TError, {
    data: BodyType<AdminLoginRequest>;
}, TContext>;
export type AdminLoginMutationResult = NonNullable<Awaited<ReturnType<typeof adminLogin>>>;
export type AdminLoginMutationBody = BodyType<AdminLoginRequest>;
export type AdminLoginMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Admin login
 */
export declare const useAdminLogin: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof adminLogin>>, TError, {
        data: BodyType<AdminLoginRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof adminLogin>>, TError, {
    data: BodyType<AdminLoginRequest>;
}, TContext>;
/**
 * @summary Get all sessions
 */
export declare const getGetAllSessionsUrl: (params?: GetAllSessionsParams) => string;
export declare const getAllSessions: (params?: GetAllSessionsParams, options?: RequestInit) => Promise<AdminSessionsResponse>;
export declare const getGetAllSessionsQueryKey: (params?: GetAllSessionsParams) => readonly ["/api/admin/sessions", ...GetAllSessionsParams[]];
export declare const getGetAllSessionsQueryOptions: <TData = Awaited<ReturnType<typeof getAllSessions>>, TError = ErrorType<unknown>>(params?: GetAllSessionsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAllSessions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAllSessions>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAllSessionsQueryResult = NonNullable<Awaited<ReturnType<typeof getAllSessions>>>;
export type GetAllSessionsQueryError = ErrorType<unknown>;
/**
 * @summary Get all sessions
 */
export declare function useGetAllSessions<TData = Awaited<ReturnType<typeof getAllSessions>>, TError = ErrorType<unknown>>(params?: GetAllSessionsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAllSessions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Get usage statistics
 */
export declare const getGetStatsUrl: (params?: GetStatsParams) => string;
export declare const getStats: (params?: GetStatsParams, options?: RequestInit) => Promise<StatsResponse>;
export declare const getGetStatsQueryKey: (params?: GetStatsParams) => readonly ["/api/admin/stats", ...GetStatsParams[]];
export declare const getGetStatsQueryOptions: <TData = Awaited<ReturnType<typeof getStats>>, TError = ErrorType<unknown>>(params?: GetStatsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getStats>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetStatsQueryResult = NonNullable<Awaited<ReturnType<typeof getStats>>>;
export type GetStatsQueryError = ErrorType<unknown>;
/**
 * @summary Get usage statistics
 */
export declare function useGetStats<TData = Awaited<ReturnType<typeof getStats>>, TError = ErrorType<unknown>>(params?: GetStatsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Get computer status
 */
export declare const getGetComputerStatusUrl: () => string;
export declare const getComputerStatus: (options?: RequestInit) => Promise<ComputerStatusResponse>;
export declare const getGetComputerStatusQueryKey: () => readonly ["/api/admin/computers"];
export declare const getGetComputerStatusQueryOptions: <TData = Awaited<ReturnType<typeof getComputerStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getComputerStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getComputerStatus>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetComputerStatusQueryResult = NonNullable<Awaited<ReturnType<typeof getComputerStatus>>>;
export type GetComputerStatusQueryError = ErrorType<unknown>;
/**
 * @summary Get computer status
 */
export declare function useGetComputerStatus<TData = Awaited<ReturnType<typeof getComputerStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getComputerStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List students
 */
export declare const getListStudentsUrl: (params?: ListStudentsParams) => string;
export declare const listStudents: (params?: ListStudentsParams, options?: RequestInit) => Promise<StudentListResponse>;
export declare const getListStudentsQueryKey: (params?: ListStudentsParams) => readonly ["/api/admin/students", ...ListStudentsParams[]];
export declare const getListStudentsQueryOptions: <TData = Awaited<ReturnType<typeof listStudents>>, TError = ErrorType<unknown>>(params?: ListStudentsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listStudents>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listStudents>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListStudentsQueryResult = NonNullable<Awaited<ReturnType<typeof listStudents>>>;
export type ListStudentsQueryError = ErrorType<unknown>;
/**
 * @summary List students
 */
export declare function useListStudents<TData = Awaited<ReturnType<typeof listStudents>>, TError = ErrorType<unknown>>(params?: ListStudentsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listStudents>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create student
 */
export declare const getCreateStudentUrl: () => string;
export declare const createStudent: (studentBody: StudentBody, options?: RequestInit) => Promise<StudentRecord>;
export declare const getCreateStudentMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createStudent>>, TError, {
        data: BodyType<StudentBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createStudent>>, TError, {
    data: BodyType<StudentBody>;
}, TContext>;
export type CreateStudentMutationResult = NonNullable<Awaited<ReturnType<typeof createStudent>>>;
export type CreateStudentMutationBody = BodyType<StudentBody>;
export type CreateStudentMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Create student
 */
export declare const useCreateStudent: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createStudent>>, TError, {
        data: BodyType<StudentBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createStudent>>, TError, {
    data: BodyType<StudentBody>;
}, TContext>;
/**
 * @summary Update student
 */
export declare const getUpdateStudentUrl: (id: number) => string;
export declare const updateStudent: (id: number, studentBody: StudentBody, options?: RequestInit) => Promise<StudentRecord>;
export declare const getUpdateStudentMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateStudent>>, TError, {
        id: number;
        data: BodyType<StudentBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateStudent>>, TError, {
    id: number;
    data: BodyType<StudentBody>;
}, TContext>;
export type UpdateStudentMutationResult = NonNullable<Awaited<ReturnType<typeof updateStudent>>>;
export type UpdateStudentMutationBody = BodyType<StudentBody>;
export type UpdateStudentMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Update student
 */
export declare const useUpdateStudent: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateStudent>>, TError, {
        id: number;
        data: BodyType<StudentBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateStudent>>, TError, {
    id: number;
    data: BodyType<StudentBody>;
}, TContext>;
/**
 * @summary Delete student
 */
export declare const getDeleteStudentUrl: (id: number) => string;
export declare const deleteStudent: (id: number, options?: RequestInit) => Promise<SuccessResponse>;
export declare const getDeleteStudentMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteStudent>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteStudent>>, TError, {
    id: number;
}, TContext>;
export type DeleteStudentMutationResult = NonNullable<Awaited<ReturnType<typeof deleteStudent>>>;
export type DeleteStudentMutationError = ErrorType<unknown>;
/**
 * @summary Delete student
 */
export declare const useDeleteStudent: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteStudent>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteStudent>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary List admins
 */
export declare const getListAdminsUrl: () => string;
export declare const listAdmins: (options?: RequestInit) => Promise<AdminListResponse>;
export declare const getListAdminsQueryKey: () => readonly ["/api/admin/admins"];
export declare const getListAdminsQueryOptions: <TData = Awaited<ReturnType<typeof listAdmins>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listAdmins>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listAdmins>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListAdminsQueryResult = NonNullable<Awaited<ReturnType<typeof listAdmins>>>;
export type ListAdminsQueryError = ErrorType<unknown>;
/**
 * @summary List admins
 */
export declare function useListAdmins<TData = Awaited<ReturnType<typeof listAdmins>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listAdmins>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create admin
 */
export declare const getCreateAdminUrl: () => string;
export declare const createAdmin: (createAdminBody: CreateAdminBody, options?: RequestInit) => Promise<AdminRecord>;
export declare const getCreateAdminMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createAdmin>>, TError, {
        data: BodyType<CreateAdminBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createAdmin>>, TError, {
    data: BodyType<CreateAdminBody>;
}, TContext>;
export type CreateAdminMutationResult = NonNullable<Awaited<ReturnType<typeof createAdmin>>>;
export type CreateAdminMutationBody = BodyType<CreateAdminBody>;
export type CreateAdminMutationError = ErrorType<unknown>;
/**
 * @summary Create admin
 */
export declare const useCreateAdmin: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createAdmin>>, TError, {
        data: BodyType<CreateAdminBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createAdmin>>, TError, {
    data: BodyType<CreateAdminBody>;
}, TContext>;
/**
 * @summary Update admin
 */
export declare const getUpdateAdminUrl: (id: number) => string;
export declare const updateAdmin: (id: number, updateAdminBody: UpdateAdminBody, options?: RequestInit) => Promise<AdminRecord>;
export declare const getUpdateAdminMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateAdmin>>, TError, {
        id: number;
        data: BodyType<UpdateAdminBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateAdmin>>, TError, {
    id: number;
    data: BodyType<UpdateAdminBody>;
}, TContext>;
export type UpdateAdminMutationResult = NonNullable<Awaited<ReturnType<typeof updateAdmin>>>;
export type UpdateAdminMutationBody = BodyType<UpdateAdminBody>;
export type UpdateAdminMutationError = ErrorType<unknown>;
/**
 * @summary Update admin
 */
export declare const useUpdateAdmin: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateAdmin>>, TError, {
        id: number;
        data: BodyType<UpdateAdminBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateAdmin>>, TError, {
    id: number;
    data: BodyType<UpdateAdminBody>;
}, TContext>;
/**
 * @summary Delete admin
 */
export declare const getDeleteAdminUrl: (id: number) => string;
export declare const deleteAdmin: (id: number, options?: RequestInit) => Promise<SuccessResponse>;
export declare const getDeleteAdminMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteAdmin>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteAdmin>>, TError, {
    id: number;
}, TContext>;
export type DeleteAdminMutationResult = NonNullable<Awaited<ReturnType<typeof deleteAdmin>>>;
export type DeleteAdminMutationError = ErrorType<unknown>;
/**
 * @summary Delete admin
 */
export declare const useDeleteAdmin: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteAdmin>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteAdmin>>, TError, {
    id: number;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map