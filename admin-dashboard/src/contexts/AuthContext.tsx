import React, { createContext, useContext, useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    try {
      // First, get fresh user data directly from Supabase server
      const { data: { user: freshUser } } = await supabase.auth.getUser()
      if (freshUser) {
        setUser(freshUser)
        // Check role from app_metadata (JWT claim set by server)
        const roleFromMeta = freshUser.app_metadata?.role || freshUser.user_metadata?.role
        if (roleFromMeta) {
          // Construct a minimal profile from metadata
          setProfile({
            id: freshUser.id,
            role: roleFromMeta,
            full_name: freshUser.user_metadata?.full_name || freshUser.email || '',
            status: 'active',
            phone_number: null,
            force_password_change: false,
            created_at: '',
            updated_at: '',
          } as Profile)
          setLoading(false)
          return
        }
      }

      // Fallback: try to fetch from profiles table
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (!error && data) {
        setProfile(data)
      } else {
        console.error('Profile fetch error:', error?.message)
      }
    } catch (e) {
      console.error('Failed to fetch profile:', e)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{
      session, user, profile, loading,
      signIn, signOut,
      isAdmin: profile?.role === 'admin' || user?.app_metadata?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
