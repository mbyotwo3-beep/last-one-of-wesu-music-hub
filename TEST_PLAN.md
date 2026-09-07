# Wesu+ Music Hub - Launch Test Plan
**Date:** September 7, 2026  
**Purpose:** Comprehensive testing before official launch

---

## Table of Contents
1. [User Role Testing](#user-role-testing)
2. [Workflow Testing](#workflow-testing)
3. [Feature Testing](#feature-testing)
4. [Critical Path Testing](#critical-path-testing)
5. [Performance & Stability](#performance--stability)

---

## User Role Testing

### Superadmin
**Access:** `/superadmin`

#### Overview Tab
- [ ] Verify platform stats display correctly
- [ ] Check analytics section loads without errors
- [ ] Verify all metrics are accurate

#### Users & Roles Tab
- [ ] List all users loads
- [ ] Grant admin role to a user
- [ ] Revoke admin role from a user
- [ ] Grant superadmin role (if applicable)
- [ ] Search/filter users works

#### Plans Tab
- [ ] View existing subscription plans
- [ ] Create new plan with valid data
- [ ] Update existing plan
- [ ] Toggle plan active/inactive

#### Payment Methods Tab
- [ ] List all payment methods
- [ ] Enable/disable payment methods
- [ ] Verify changes reflect in checkout

#### Payout Decisions Tab
- [ ] View pending payout requests
- [ ] Approve a payout request
- [ ] Reject a payout request with reason
- [ ] Verify payout status updates

#### Labels Tab
- [ ] View all labels
- [ ] Search/filter labels

#### Featured Tab
- [ ] View featured slots
- [ ] Add featured song/album
- [ ] Remove featured item
- [ ] Update featured slot

#### Settings Tab
- [ ] Update site name
- [ ] Update support email
- [ ] Set commission to 20% for non-free songs
- [ ] Set free song fee to K100
- [ ] Update upload pricing (min/max)
- [ ] Update verification requirements
- [ ] Update withdrawal settings
- [ ] Save settings and verify persistence

#### Audit Log Tab
- [ ] View audit log entries
- [ ] Filter by date/action
- [ ] Verify all critical actions are logged

---

### Admin
**Access:** `/admin`

#### Overview Tab
- [ ] Verify pending counts are accurate
- [ ] Navigate to each section from overview

#### Songs Tab
- [ ] View pending songs
- [ ] Approve a song
- [ ] Reject a song with reason
- [ ] Delete a song
- [ ] View all songs (approved/pending)
- [ ] Search/filter songs

#### Artists Tab
- [ ] View pending artist applications
- [ ] Approve an artist
- [ ] Reject an artist with reason
- [ ] View all artists
- [ ] Search/filter artists

#### Verifications Tab
- [ ] View pending verification requests
- [ ] Approve verification
- [ ] Reject verification with reason
- [ ] Verify verification requirements

#### Labels Tab
- [ ] View pending label applications
- [ ] Approve a label
- [ ] Reject a label with reason
- [ ] View all labels

#### Payouts Tab
- [ ] View payout requests
- [ ] Review payout with notes
- [ ] Approve payout
- [ ] Reject payout
- [ ] Verify payout status

#### Transaction Reconciliation Tab
- [ ] View stuck transactions
- [ ] Re-check individual transaction
- [ ] Re-check all transactions
- [ ] Cancel stuck transaction
- [ ] Verify transaction status updates

#### Carousels Tab
- [ ] View existing carousels
- [ ] Create new carousel
- [ ] Edit carousel
- [ ] Delete carousel
- [ ] Add items to carousel
- [ ] Reorder carousel items

#### Hero Carousel Tab
- [ ] View existing hero slides
- [ ] Create new hero slide
- [ ] Upload image for hero slide
- [ ] Paste image URL for hero slide
- [ ] Set title, description, CTA
- [ ] Add video URL (optional)
- [ ] Toggle slide active/inactive
- [ ] Reorder slides (move up/down)
- [ ] Edit existing slide
- [ ] Delete slide
- [ ] **Test form persistence:** Fill form, navigate away, return - data should be preserved
- [ ] Verify hero carousel displays on homepage

#### Diagnostics Tab
- [ ] View artist diagnostics
- [ ] Check for stuck uploads
- [ ] Verify system health

---

### Artist
**Access:** `/artist-studio` and `/artist-dashboard`

#### Artist Dashboard
- [ ] View artist overview stats
- [ ] View uploaded songs
- [ ] View albums
- [ ] View earnings
- [ ] View profile

#### Artist Studio (Upload)
- [ ] Navigate to artist studio
- [ ] Select "Single" mode
- [ ] Enter song title
- [ ] Enter description
- [ ] Select genre
- [ ] Set release date (optional)
- [ ] **Check "Has Feature" checkbox**
- [ ] **Check "Has Label" checkbox** (if signed to label)
- [ ] Upload cover art (optional)
- [ ] Upload audio file
- [ ] Select tier (free/paid)
- [ ] Set price (if paid)
- [ ] Agree to fee terms
- [ ] Submit song
- [ ] Verify song appears in pending
- [ ] **Test form persistence:** Fill form, navigate away, return - data should be preserved

#### Album Upload
- [ ] Select "Album" mode
- [ ] Enter album title
- [ ] Enter description
- [ ] Select genre
- [ ] Set release date (optional)
- [ ] Upload cover art
- [ ] Upload multiple audio files
- [ ] Set price
- [ ] Submit album
- [ ] Verify album appears in pending

#### Artist Profile Edit
- [ ] Navigate to profile edit
- [ ] Update artist name
- [ ] Update bio
- [ ] Update genre
- [ ] Upload avatar
- [ ] Upload cover image
- [ ] Update social links (with icons)
- [ ] Save changes
- [ ] Verify profile updates

---

### Label
**Access:** `/label-dashboard`

#### Label Dashboard
- [ ] View label overview
- [ ] View signed artists
- [ ] View label earnings
- [ ] View label releases
- [ ] Manage label settings

---

### Listener
**Access:** Homepage, browse, library

#### Homepage
- [ ] View hero carousel (auto-rotates if >1 slide)
- [ ] Navigate using carousel arrows
- [ ] Click carousel CTA buttons
- [ ] Pause/play carousel
- [ ] View featured carousels
- [ ] Browse new releases
- [ ] Browse trending songs

#### Browse
- [ ] Browse songs
- [ ] Browse albums
- [ ] Browse artists
- [ ] Use search functionality
- [ ] Filter by genre
- [ ] Sort by various options

#### Song Detail Page
- [ ] View song details
- [ ] Play song preview
- [ ] Add to Liked Songs (via 3-dot menu)
- [ ] Remove from Liked Songs
- [ ] Add to playlist (via 3-dot menu)
- [ ] Create new playlist (via 3-dot menu)
- [ ] Add to queue (via 3-dot menu)
- [ ] Copy song link (via 3-dot menu)
- [ ] Go to artist (via 3-dot menu)
- [ ] Go to album (via 3-dot menu)
- [ ] Buy song (if paid)
- [ ] Download song (if free)

#### Album Detail Page
- [ ] View album details
- [ ] Play album
- [ ] View tracklist
- [ ] Buy album
- [ ] Add individual songs to playlist
- [ ] Share album (via 3-dot menu)

#### Artist Profile Page
- [ ] View artist profile
- [ ] View artist songs
- [ ] View artist albums
- [ ] Follow artist
- [ ] View social links (clickable)
- [ ] Share artist (via 3-dot menu)

#### Playlist Page
- [ ] View my playlists
- [ ] Create new playlist
- [ ] Edit playlist name
- [ ] Add songs to playlist
- [ ] Remove songs from playlist
- [ ] Reorder songs in playlist
- [ ] Delete playlist
- [ ] Make playlist public/private
- [ ] Share playlist (via 3-dot menu)

#### Library
- [ ] View Liked Songs
- [ ] View recently added
- [ ] View all songs
- [ ] View all albums
- [ ] View all artists

#### Player
- [ ] Play song
- [ ] Pause song
- [ ] Skip to next
- [ ] Skip to previous
- [ ] Seek within track
- [ ] Adjust volume
- [ ] View queue
- [ ] Clear queue
- [ ] Shuffle queue
- [ ] Repeat track

---

## Workflow Testing

### Song Upload Workflow
1. Artist logs in
2. Navigates to Artist Studio
3. Fills in song details (title, description, genre, release date)
4. Checks "Has Feature" if applicable
5. Checks "Has Label" if applicable
6. Uploads cover art
7. Uploads audio file
8. Sets pricing tier
9. Agrees to fee terms
10. Submits song
11. Song appears in admin pending queue
12. Admin approves song
13. Song appears on platform

### Album Upload Workflow
1. Artist logs in
2. Navigates to Artist Studio
3. Selects Album mode
4. Fills in album details
5. Uploads cover art
6. Uploads multiple audio files
7. Sets price
8. Submits album
9. Album appears in admin pending queue
10. Admin approves album
11. Album appears on platform

### Purchase Workflow
1. Listener browses songs
2. Selects paid song
3. Clicks buy button
4. Selects payment method
5. Completes payment
6. Song is added to library
7. Song can be downloaded

### Payout Workflow
1. Artist earns from sales
2. Artist requests payout
3. Admin reviews payout request
4. Admin approves payout
5. Superadmin processes payout
6. Payout marked as completed

### Hero Carousel Workflow
1. Admin navigates to Hero Carousel tab
2. Clicks "New Slide"
3. Uploads image or pastes URL
4. Enters title, description
5. Sets CTA text and link
6. Optionally adds video URL
7. Submits slide
8. Toggles slide active
9. Slide appears on homepage
10. Carousel auto-rotates (if >1 slide)

---

## Feature Testing

### Hero Carousel
- [ ] Full-width display
- [ ] Netflix-style gradient overlay
- [ ] Auto-rotation (only if >1 slide)
- [ ] Manual navigation arrows
- [ ] Pause/play button
- [ ] Progress bar
- [ ] Pagination dots
- [ ] Responsive design (mobile/desktop)
- [ ] Video support (iframe)
- [ ] CTA button functionality
- [ ] External vs internal link handling

### 3-Dot Menus (ShareMenu)
- [ ] Opens on click
- [ ] Closes on outside click
- [ ] Positioned correctly (z-index)
- [ ] Add to Liked Songs
- [ ] Remove from Liked Songs
- [ ] Add to playlist
- [ ] Create new playlist
- [ ] Add to queue
- [ ] Copy link
- [ ] Go to artist (song menu)
- [ ] Go to album (song menu)
- [ ] Authentication redirect (if not logged in)
- [ ] Post-auth action execution

### Podcast Page
- [ ] Navigate to /podcast
- [ ] Displays "Coming Soon" message
- [ ] Shows podcast icon
- [ ] Responsive design

### Commission System
- [ ] Superadmin can set commission to 20%
- [ ] Commission saves correctly
- [ ] Terms and conditions show 20%
- [ ] Free song fee is K100
- [ ] Commission calculation is correct

### App Stability
- [ ] No app flickering/reloading
- [ ] Form data persists on navigation
- [ ] No React errors in console
- [ ] Smooth transitions
- [ ] No memory leaks

---

## Critical Path Testing

### New User Onboarding
1. [ ] User can sign up
2. [ ] User can verify email (if required)
3. [ ] User can browse content
4. [ ] User can create playlists
5. [ ] User can like songs

### Artist Application
1. [ ] User can apply to become artist
2. [ ] Application appears in admin queue
3. [ ] Admin can approve/reject
4. [ ] Approved artist can access studio
5. [ ] Artist can upload content

### Purchase Flow
1. [ ] Listener can find paid content
2. [ ] Listener can initiate purchase
3. [ ] Payment methods work
4. [ ] Purchase completes successfully
5. [ ] Content is accessible after purchase

### Content Moderation
1. [ ] Uploaded content goes to pending
2. [ ] Admin can review content
3. [ ] Admin can approve/reject
4. [ ] Approved content is visible
5. [ ] Rejected content is not visible

---

## Performance & Stability

### Load Testing
- [ ] Homepage loads in <3 seconds
- [ ] Song pages load in <2 seconds
- [ ] Search results appear in <1 second
- [ ] Audio player starts quickly
- [ ] Images load progressively

### Error Handling
- [ ] 404 pages display correctly
- [ ] Network errors show user-friendly messages
- [ ] Form validation works
- [ ] Required fields are enforced
- [ ] File upload limits enforced

### Browser Compatibility
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

### Mobile Responsiveness
- [ ] Homepage layout on mobile
- [ ] Navigation works on mobile
- [ ] Bottom tab bar works
- [ ] Touch interactions work
- [ ] Audio player controls accessible

---

## Pre-Launch Checklist

### Database
- [ ] release_date column added to songs table
- [ ] All migrations run successfully
- [ ] No orphaned records
- [ ] Indexes are optimized

### Configuration
- [ ] Commission set to 20%
- [ ] Free song fee set to K100
- [ ] Payment methods configured
- [ ] Upload pricing set correctly
- [ ] Verification requirements set

### Content
- [ ] Hero carousel has at least 1 active slide
- [ ] Featured content configured
- [ ] Terms and conditions updated to 20%
- [ ] Default playlists exist

### Security
- [ ] Row Level Security policies active
- [ ] API rate limits configured
- [ ] File upload restrictions enforced
- [ ] Authentication working correctly

### Monitoring
- [ ] Error tracking enabled
- [ ] Analytics configured
- [ ] Audit logging active
- [ ] Performance monitoring setup

---

## Test Results Template

| Feature | Status | Notes | Tester |
|---------|--------|-------|--------|
| Hero Carousel | ⬜ | | |
| 3-Dot Menus | ⬜ | | |
| Song Upload | ⬜ | | |
| Album Upload | ⬜ | | |
| Purchase Flow | ⬜ | | |
| Payout System | ⬜ | | |
| Admin Panel | ⬜ | | |
| Superadmin Panel | ⬜ | | |
| Artist Studio | ⬜ | | |
| Label Dashboard | ⬜ | | |
| Listener Features | ⬜ | | |
| Commission System | ⬜ | | |
| App Stability | ⬜ | | |

**Legend:**
- ✅ Pass
- ❌ Fail
- ⚠️ Needs Review
- ⬜ Not Tested

---

**Notes:**
- All critical issues must be resolved before launch
- Document any bugs found with reproduction steps
- Take screenshots of any UI issues
- Test with real data where possible
- Test with different user roles simultaneously
