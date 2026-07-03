// backend/src/modules/identity/registration/oauth.service.ts
//
// Real server-side OAuth authorization-code exchange for Google and
// Facebook. This is what registerOrLoginWithSocial's DTO comment flagged as
// "not yet built" -- the piece that actually proves a person controls the
// provider account, rather than trusting whatever a POST body claims.
//
// Instagram is deliberately NOT implemented here. Meta deprecated Instagram
// Basic Display API in favour of "Instagram API with Facebook Login", which
// requires the member's Instagram to be a Business/Creator account linked
// to a Facebook Page, plus Meta app review for anything beyond a handful of
// test users. That's a disproportionate maintenance burden for a ~15-member
// club with no revenue to justify it. Recommend dropping Instagram social
// login and relying on Google + Facebook + email + magic link instead --
// flagged here, not silently dropped from the spec's provider list; revisit
// if a specific member need shows up.

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SocialProvider } from './dto/social-login.dto';

export interface OAuthProfile {
  providerUserId: string;
  email: string;
  fullName: string;
}

@Injectable()
export class OAuthService {
  getAuthorizeUrl(provider: SocialProvider): string {
    switch (provider) {
      case SocialProvider.GOOGLE: {
        const clientId = this.require('GOOGLE_CLIENT_ID', 'Google');
        const redirectUri = this.require('GOOGLE_REDIRECT_URI', 'Google');
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'openid email profile',
          access_type: 'online',
          prompt: 'select_account',
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      }
      case SocialProvider.FACEBOOK: {
        const clientId = this.require('FACEBOOK_CLIENT_ID', 'Facebook');
        const redirectUri = this.require('FACEBOOK_REDIRECT_URI', 'Facebook');
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'email,public_profile',
        });
        return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
      }
      case SocialProvider.INSTAGRAM:
        throw new ServiceUnavailableException(
          'Instagram login is not available -- Meta\'s current Instagram OAuth requires a Business/Creator account and app review. Use Google, Facebook, or email instead.',
        );
    }
  }

  async exchangeCodeForProfile(provider: SocialProvider, code: string): Promise<OAuthProfile> {
    switch (provider) {
      case SocialProvider.GOOGLE:
        return this.googleExchange(code);
      case SocialProvider.FACEBOOK:
        return this.facebookExchange(code);
      case SocialProvider.INSTAGRAM:
        throw new ServiceUnavailableException('Instagram login is not available.');
    }
  }

  private require(envVar: string, providerLabel: string): string {
    const value = process.env[envVar];
    if (!value) {
      throw new ServiceUnavailableException(
        `${providerLabel} login is not configured yet (missing ${envVar}).`,
      );
    }
    return value;
  }

  private async googleExchange(code: string): Promise<OAuthProfile> {
    const clientId = this.require('GOOGLE_CLIENT_ID', 'Google');
    const clientSecret = this.require('GOOGLE_CLIENT_SECRET', 'Google');
    const redirectUri = this.require('GOOGLE_REDIRECT_URI', 'Google');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new ServiceUnavailableException(`Google token exchange failed: ${await tokenRes.text()}`);
    }
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) {
      throw new ServiceUnavailableException(`Google profile fetch failed: ${await profileRes.text()}`);
    }
    const profile = (await profileRes.json()) as { sub: string; email: string; name: string };

    return { providerUserId: profile.sub, email: profile.email, fullName: profile.name };
  }

  private async facebookExchange(code: string): Promise<OAuthProfile> {
    const clientId = this.require('FACEBOOK_CLIENT_ID', 'Facebook');
    const clientSecret = this.require('FACEBOOK_CLIENT_SECRET', 'Facebook');
    const redirectUri = this.require('FACEBOOK_REDIRECT_URI', 'Facebook');

    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });
    const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams.toString()}`);
    if (!tokenRes.ok) {
      throw new ServiceUnavailableException(`Facebook token exchange failed: ${await tokenRes.text()}`);
    }
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

    const profileParams = new URLSearchParams({ fields: 'id,name,email', access_token: accessToken });
    const profileRes = await fetch(`https://graph.facebook.com/me?${profileParams.toString()}`);
    if (!profileRes.ok) {
      throw new ServiceUnavailableException(`Facebook profile fetch failed: ${await profileRes.text()}`);
    }
    const profile = (await profileRes.json()) as { id: string; email: string; name: string };

    return { providerUserId: profile.id, email: profile.email, fullName: profile.name };
  }
}
